import process from 'node:process';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pluginCacheRoot, selectStaleVersions, listVersionDirs } from './lib/plugin-cache.mjs';

// update-local：一条龙更新本地安装的 enterprise-harness 插件并清理旧缓存。
// 背景：插件作者迭代时，plugin update 默认查 user scope，但本地多是 local scope，
// 直接 update 会报 "not installed at scope user"；且旧版本缓存目录里的旧 hook
// 仍会被加载并报错（如 stop hook JSON validation failed）。此命令固化正确流程。

const PLUGIN_ID = 'enterprise-harness@enterprise-harness';
const MARKETPLACE = 'enterprise-harness';
const help = process.argv.includes('--help') || process.argv.includes('-h');
const dryRun = process.argv.includes('--dry-run');

if (help) {
  console.log('Enterprise Harness Update-Local');
  console.log('Usage: node harness/plugin/runtime/cli.mjs update-local [--dry-run]');
  console.log('更新本地安装的 enterprise-harness 插件到最新版本，并清理旧版本缓存目录。');
  console.log('  --dry-run  只报告将要执行的动作，不实际更新或删除');
  process.exit(0);
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf-8' });
}

// 读取当前安装的插件条目（含 version / scope / installPath）；claude 不可用或未安装时返回 null。
function readInstalled() {
  const listed = run('claude', ['plugin', 'list', '--json']);
  if (listed.status !== 0) return { error: listed.stderr || listed.stdout || 'claude plugin list 失败' };
  let parsed;
  try {
    parsed = JSON.parse(listed.stdout || '[]');
  } catch {
    return { error: 'plugin list --json 输出无法解析' };
  }
  const entry = parsed.find((p) => p.id === PLUGIN_ID);
  return { entry: entry || null };
}

const cacheRoot = pluginCacheRoot();

// 清理 installPath 之外的旧版本缓存目录，返回被删（或将删）的版本列表。
function staleVersionDirs(keepPath) {
  return selectStaleVersions(listVersionDirs(cacheRoot), cacheRoot, keepPath);
}

console.log('Enterprise Harness Update-Local');

// 1. 读取更新前状态。
const before = readInstalled();
if (before.error) {
  console.error(`BLOCK: 无法读取已安装插件：${before.error}`);
  console.error('恢复：确认 `claude` CLI 可用，且插件已安装（claude plugin list）。');
  process.exit(2);
}
if (!before.entry) {
  console.error(`BLOCK: 未找到已安装的 ${PLUGIN_ID}。`);
  console.error('恢复：先安装：claude plugin install ' + PLUGIN_ID + ' --scope local');
  process.exit(2);
}
const scope = before.entry.scope || 'local';
const fromVersion = before.entry.version;
console.log(`- 当前版本：${fromVersion}（scope=${scope}）`);

if (dryRun) {
  console.log('- [dry-run] 将执行：marketplace update -> plugin update --scope ' + scope);
  const stale = staleVersionDirs(before.entry.installPath).filter((s) => s.version !== fromVersion);
  for (const s of stale) console.log(`- [dry-run] 将删除旧缓存：${s.version}`);
  console.log('Update-local dry-run complete.');
  process.exit(0);
}

// 2. 更新 marketplace 元数据。
const mkt = run('claude', ['plugin', 'marketplace', 'update', MARKETPLACE]);
process.stdout.write(mkt.stdout || '');
if (mkt.status !== 0) {
  console.error(`BLOCK: marketplace update 失败：${mkt.stderr || ''}`);
  console.error('恢复：确认 marketplace 已添加：claude plugin marketplace add <repo-url-or-path>');
  process.exit(2);
}

// 3. 用实际 scope 更新插件（关键：默认 user scope 会漏掉 local 安装）。
const upd = run('claude', ['plugin', 'update', PLUGIN_ID, '--scope', scope]);
process.stdout.write(upd.stdout || '');
process.stderr.write(upd.stderr || '');
if (upd.status !== 0) {
  console.error(`BLOCK: plugin update 失败（scope=${scope}）。`);
  console.error('恢复：手动执行 claude plugin update ' + PLUGIN_ID + ' --scope ' + scope);
  process.exit(2);
}

// 4. 复核版本是否真的变化。
const after = readInstalled();
const toVersion = after.entry?.version ?? '未知';
if (toVersion === fromVersion) {
  console.log(`- 已是最新：${toVersion}（无版本变化）`);
} else {
  console.log(`- 已更新：${fromVersion} -> ${toVersion}`);
}

// 5. 清理旧版本缓存（保留当前启用版本目录），避免旧 hook 继续被加载报错。
const keepPath = after.entry?.installPath || before.entry.installPath;
const stale = staleVersionDirs(keepPath);
let removed = 0;
for (const s of stale) {
  try {
    fs.rmSync(s.dir, { recursive: true, force: true });
    console.log(`- 已清理旧缓存：${s.version}`);
    removed += 1;
  } catch (e) {
    console.error(`- 警告：清理 ${s.version} 失败：${e.message}`);
  }
}
if (removed === 0) console.log('- 无需清理旧缓存。');

console.log('Update-local complete. 若插件行为变化，请重启 Claude Code 会话以应用。');
process.exit(0);
