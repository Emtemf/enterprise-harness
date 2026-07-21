import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/plugin-native-hooks-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// Contract 1: plugin hooks payload must resolve scripts via ${CLAUDE_PLUGIN_ROOT},
// never via project-relative paths that break inside a target project.
const hooksJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf-8'));
const hookCommands = [];
for (const eventEntries of Object.values(hooksJson.hooks ?? {})) {
  for (const entry of eventEntries) {
    for (const hook of entry.hooks ?? []) {
      if (hook.type === 'command') hookCommands.push(hook.command);
    }
  }
}
const allUsePluginRoot = hookCommands.length > 0 && hookCommands.every((cmd) => cmd.includes('${CLAUDE_PLUGIN_ROOT}'));
const nonePluginRelative = hookCommands.every((cmd) => !/node harness\//.test(cmd));

// Contract 1b: 本地 .claude/settings.json 的 hook 必须用 $CLAUDE_PROJECT_DIR，
// 不能用 ${CLAUDE_PLUGIN_ROOT}——后者只在插件 hooks/hooks.json 有效，settings.json
// 里用它会报 "references ${CLAUDE_PLUGIN_ROOT} but the hook is not associated with a plugin"。
const settingsJson = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude', 'settings.json'), 'utf-8'));
const settingsCommands = [];
for (const eventEntries of Object.values(settingsJson.hooks ?? {})) {
  for (const entry of eventEntries) {
    for (const hook of entry.hooks ?? []) {
      if (hook.type === 'command') settingsCommands.push(hook.command);
    }
  }
}
const settingsUseProjectDir = settingsCommands.length > 0 && settingsCommands.every((cmd) => cmd.includes('$CLAUDE_PROJECT_DIR'));
const settingsNoPluginRoot = settingsCommands.every((cmd) => !cmd.includes('CLAUDE_PLUGIN_ROOT'));

// Contract 2: hook scripts must degrade gracefully when cwd is a target project
// WITHOUT harness assets: exit 0, no MODULE_NOT_FOUND, no structure-problem spam.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-native-target-'));
const targetProject = path.join(tempRoot, 'target-project');
fs.mkdirSync(path.join(targetProject, 'src'), { recursive: true });
fs.writeFileSync(path.join(targetProject, 'pom.xml'), '<project/>\n', 'utf-8');

function runHook(script, input = '') {
  return spawnSync('node', [path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', script)], {
    cwd: targetProject,
    encoding: 'utf-8',
    input,
  });
}

try {
  const sessionStart = runHook('session-start.mjs');
  const preWrite = runHook('pre-write.mjs', JSON.stringify({ tool_input: { file_path: path.join(targetProject, 'src', 'A.java') } }));
  const postWrite = runHook('post-write.mjs', JSON.stringify({ tool_input: { file_path: path.join(targetProject, 'src', 'A.java') } }));
  const stop = runHook('stop.mjs');

  const failures = [];
  if (!allUsePluginRoot) failures.push('hooks.json commands must use ${CLAUDE_PLUGIN_ROOT}');
  if (!nonePluginRelative) failures.push('hooks.json commands must not use project-relative "node harness/..." paths');
  if (!settingsUseProjectDir) failures.push('.claude/settings.json commands must use $CLAUDE_PROJECT_DIR');
  if (!settingsNoPluginRoot) failures.push('.claude/settings.json commands must NOT use ${CLAUDE_PLUGIN_ROOT} (only valid in plugin hooks.json)');
  if (sessionStart.status !== 0) failures.push(`session-start exit=${sessionStart.status}: ${sessionStart.stderr?.slice(0, 200)}`);
  if (!`${sessionStart.stdout}`.includes('/harness')) failures.push('session-start in target project must still point users to /harness');
  if (preWrite.status !== 0) failures.push(`pre-write exit=${preWrite.status}: ${preWrite.stderr?.slice(0, 200)}`);
  if (postWrite.status !== 0) failures.push(`post-write exit=${postWrite.status} in non-harness project: ${(postWrite.stderr || postWrite.stdout)?.slice(0, 300)}`);
  if (stop.status !== 0) failures.push(`stop exit=${stop.status}: ${stop.stderr?.slice(0, 200)}`);
  const combined = [sessionStart, preWrite, postWrite, stop].map((r) => `${r.stdout}${r.stderr}`).join('\n');
  if (combined.includes('MODULE_NOT_FOUND')) failures.push('hooks must not crash with MODULE_NOT_FOUND in a target project');

  const ok = failures.length === 0;

  if (mode === 'red') {
    if (!ok) {
      fail(`Expected plugin-native hooks contract to fail before implementation:\n${failures.join('\n')}`);
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail(`Expected plugin-native hooks contract to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green plugin-native-hooks smoke passed.' : 'Plugin-native-hooks verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
