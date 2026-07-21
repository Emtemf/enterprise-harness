import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 枚举一个 settings/hooks JSON 对象里某事件（如 Stop）的所有 hook 命令。
export function extractEventCommands(configObj, event) {
  const out = [];
  const entries = configObj?.hooks?.[event] ?? [];
  for (const entry of entries) {
    for (const hook of entry.hooks ?? []) {
      if (hook.type === 'command' && typeof hook.command === 'string') out.push(hook.command);
    }
  }
  return out;
}

// 判断一个 hook 的 stdout 是否符合 Claude Code Stop hook 契约：
// 空输出或合法 JSON 皆可（放行应输出 {}）；非法 JSON 文本会被宿主判 "JSON validation failed"。
// 且不得含 Stop schema 不认的字段（continue / suppressOutput）——第三方插件常犯。
export function classifyStopStdout(stdout) {
  const text = String(stdout ?? '').trim();
  if (text.length === 0) return { ok: false, reason: 'empty-stdout（放行应输出 {}）' };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  const forbidden = ['continue', 'suppressOutput', 'hookEventName'];
  const bad = forbidden.filter((k) => Object.prototype.hasOwnProperty.call(parsed, k));
  if (bad.length) return { ok: false, reason: `forbidden-field:${bad.join(',')}` };
  return { ok: true, reason: 'valid' };
}

// 收集所有可能贡献 Stop hook 的来源：各 settings 文件 + 每个已启用插件的 hooks.json。
// 返回 [{ source, command }]，command 里的 ${VAR} 保留原样（仅用于展示/审计）。
export function collectStopSources({ home = os.homedir(), projectRoot } = {}) {
  const sources = [];
  const settingsFiles = [
    { label: 'user settings.json', file: path.join(home, '.claude', 'settings.json') },
    { label: 'user settings.local.json', file: path.join(home, '.claude', 'settings.local.json') },
  ];
  if (projectRoot) {
    settingsFiles.push({ label: 'project settings.json', file: path.join(projectRoot, '.claude', 'settings.json') });
    settingsFiles.push({ label: 'project settings.local.json', file: path.join(projectRoot, '.claude', 'settings.local.json') });
  }
  for (const { label, file } of settingsFiles) {
    if (!fs.existsSync(file)) continue;
    try {
      const obj = JSON.parse(fs.readFileSync(file, 'utf-8'));
      for (const cmd of extractEventCommands(obj, 'Stop')) sources.push({ source: label, command: cmd });
    } catch {
      sources.push({ source: label, command: null, error: 'parse-failed' });
    }
  }
  return sources;
}
