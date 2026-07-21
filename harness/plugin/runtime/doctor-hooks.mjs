import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { collectStopSources, classifyStopStdout, extractEventCommands } from './lib/hook-audit.mjs';

// doctor-hooks：自检"全新会话会加载的 Stop hook 是否都健康"，回答
// "改完 hook / 更新插件后，新会话还会不会报 JSON validation failed"。

const repoRoot = process.cwd();
const home = os.homedir();
const asJson = process.argv.includes('--json');

const findings = [];

// 1. 各 settings 文件里的 Stop hook：实际执行 harness 自己的 stop.mjs 验证 stdout。
const settingsSources = collectStopSources({ home, projectRoot: repoRoot });
for (const src of settingsSources) {
  if (!src.command) {
    findings.push({ source: src.source, kind: 'settings', ok: false, detail: src.error || 'no command' });
    continue;
  }
  // 展开 $CLAUDE_PROJECT_DIR（settings.json 用它），只对指向本仓库 stop.mjs 的命令实跑。
  const expanded = src.command.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, repoRoot);
  const isHarnessStop = expanded.includes('harness/plugin/runtime/hooks/stop.mjs');
  if (isHarnessStop) {
    const scriptPath = extractScriptPath(expanded);
    const res = spawnSync('node', [scriptPath], { input: '{}', encoding: 'utf-8' });
    const verdict = classifyStopStdout(res.stdout);
    findings.push({
      source: src.source,
      kind: 'settings',
      command: src.command,
      ok: res.status === 0 && verdict.ok,
      detail: `exit=${res.status} stdout=${verdict.reason}`,
    });
  } else {
    findings.push({ source: src.source, kind: 'settings', command: src.command, ok: true, detail: 'non-harness command, skipped exec' });
  }
}

// 2. 已启用插件的 hooks.json Stop hook：静态审计其声明（不执行第三方脚本），
//    标记那些明显会触发 JSON validation failed 的第三方插件。
const enabled = listEnabledPlugins();
for (const plugin of enabled) {
  const hooksJson = plugin.installPath ? path.join(plugin.installPath, 'hooks', 'hooks.json') : null;
  if (!hooksJson || !fs.existsSync(hooksJson)) continue;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(hooksJson, 'utf-8'));
  } catch {
    findings.push({ source: `plugin ${plugin.id}`, kind: 'plugin', ok: false, detail: 'hooks.json parse-failed' });
    continue;
  }
  const stopCmds = extractEventCommands(obj, 'Stop');
  if (stopCmds.length === 0) continue;
  const isOurs = plugin.id.startsWith('enterprise-harness');
  if (isOurs) {
    // 实跑我们自己的 stop.mjs（用插件缓存路径展开 CLAUDE_PLUGIN_ROOT）。
    for (const cmd of stopCmds) {
      const expanded = cmd.replace(/\$\{?CLAUDE_PLUGIN_ROOT\}?/g, plugin.installPath);
      const scriptPath = extractScriptPath(expanded);
      const res = spawnSync('node', [scriptPath], { input: '{}', encoding: 'utf-8' });
      const verdict = classifyStopStdout(res.stdout);
      findings.push({
        source: `plugin ${plugin.id}@${plugin.version}`,
        kind: 'plugin',
        command: cmd,
        ok: res.status === 0 && verdict.ok,
        detail: `exit=${res.status} stdout=${verdict.reason}`,
      });
    }
  } else {
    // 第三方插件：静态标记（我们不执行别人的脚本），提示它是潜在报错源。
    findings.push({
      source: `plugin ${plugin.id}@${plugin.version}`,
      kind: 'third-party',
      ok: false,
      severity: 'warn',
      detail: `第三方插件声明了 ${stopCmds.length} 个 Stop hook；若报 JSON validation failed 可能源于此，非 enterprise-harness。enabled=${plugin.enabled}`,
    });
  }
}

function extractScriptPath(expandedCommand) {
  // 从 `node "/path/to/x.mjs"` 或 `node /path/x.mjs ...` 里取第一个 .mjs 路径。
  const m = expandedCommand.match(/([^\s"']+\.mjs)/);
  return m ? m[1] : expandedCommand;
}

function listEnabledPlugins() {
  const res = spawnSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf-8' });
  if (res.status !== 0) return [];
  try {
    return JSON.parse(res.stdout || '[]');
  } catch {
    return [];
  }
}

const hardFailed = findings.filter((f) => !f.ok && (f.severity ?? 'error') === 'error');
const warnings = findings.filter((f) => !f.ok && (f.severity ?? 'error') === 'warn');
const result = {
  repoRoot,
  ok: hardFailed.length === 0,
  failedCount: hardFailed.length,
  warningCount: warnings.length,
  findings,
};

if (asJson) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

console.log('Enterprise Harness Doctor: Stop Hooks');
console.log(`Repo: ${repoRoot}`);
for (const f of findings) {
  const sev = f.severity ?? 'error';
  const prefix = f.ok ? 'OK  ' : sev === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${prefix} [${f.kind}] ${f.source}`);
  if (f.detail) console.log(`     ${f.detail}`);
}
console.log('');
if (result.ok && warnings.length === 0) {
  console.log('✅ 全新会话的所有 Stop hook 都健康，不会报 JSON validation failed。');
} else if (result.ok) {
  console.log(`⚠️  enterprise-harness 自身健康；有 ${warnings.length} 个第三方插件 Stop hook 可能是报错源（见上 WARN）。`);
} else {
  console.log(`❌ 有 ${hardFailed.length} 个 Stop hook 不健康，需修复（见上 FAIL）。`);
}
console.log('提示：hook 改动只对全新会话生效（完全退出后重新 claude，勿用 --continue/--resume）。');

process.exit(result.ok ? 0 : 1);
