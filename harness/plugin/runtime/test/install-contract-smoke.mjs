import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const installScriptPath = path.join(repoRoot, 'bin', 'install.mjs');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph' || entry.name === 'node_modules') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/install-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-contract-smoke-'));
try {
  const targetProject = path.join(tempRoot, 'target-project');
  fs.mkdirSync(targetProject, { recursive: true });

  // 模拟用户已有 settings.json（含一个自定义 hook）
  const userClaudeDir = path.join(targetProject, '.claude');
  fs.mkdirSync(userClaudeDir, { recursive: true });
  fs.writeFileSync(path.join(userClaudeDir, 'settings.json'), JSON.stringify({
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'echo user-custom-hook' }] }
      ]
    }
  }, null, 2), 'utf-8');

  // 运行 install.mjs
  const installResult = spawnSync('node', [installScriptPath, '--target', targetProject], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  const claudeSettingsPath = path.join(targetProject, '.claude', 'settings.json');
  const claudeSettingsExists = fs.existsSync(claudeSettingsPath);
  const claudeMdExists = fs.existsSync(path.join(targetProject, 'CLAUDE.md'));
  const agentsMdExists = fs.existsSync(path.join(targetProject, 'AGENTS.md'));
  const rulesDirExists = fs.existsSync(path.join(targetProject, '.claude', 'rules'));
  const skillsDirExists = fs.existsSync(path.join(targetProject, '.claude', 'skills'));
  const harnessDirExists = fs.existsSync(path.join(targetProject, 'harness'));

  // 智能合并检查：用户自定义 hook 仍在
  let userHookPreserved = false;
  if (claudeSettingsExists) {
    const merged = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf-8'));
    userHookPreserved = JSON.stringify(merged).includes('user-custom-hook');
  }

  const ok =
    installResult.status === 0 &&
    claudeSettingsExists &&
    claudeMdExists &&
    agentsMdExists &&
    rulesDirExists &&
    skillsDirExists &&
    harnessDirExists &&
    userHookPreserved;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected install contract to fail before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    const failures = [];
    if (installResult.status !== 0) failures.push(`install.mjs exited ${installResult.status}: ${(installResult.stderr || '').trim()}`);
    if (!claudeSettingsExists) failures.push('settings.json not created/merged');
    if (!claudeMdExists) failures.push('CLAUDE.md not installed');
    if (!agentsMdExists) failures.push('AGENTS.md not installed');
    if (!rulesDirExists) failures.push('.claude/rules/ not installed');
    if (!skillsDirExists) failures.push('.claude/skills/ not installed');
    if (!harnessDirExists) failures.push('harness/ not installed');
    if (!userHookPreserved) failures.push('user custom hook not preserved in smart merge');
    fail(`Expected install contract to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green install-contract smoke passed.' : 'Install-contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
