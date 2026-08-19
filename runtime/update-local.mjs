import process from 'node:process';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pluginCacheRoot, planCacheCleanup, listVersionDirs } from './lib/plugin-cache.mjs';

// update-local：一条龙更新本地安装的 enterprise-harness 插件，并安全管理旧缓存。
// 背景：插件作者迭代时，plugin update 默认查 user scope，但本地多是 local scope，
// 直接 update 会报 "not installed at scope user"。活动会话可能仍引用更新前的
// CLAUDE_PLUGIN_ROOT，因此默认保留旧缓存；仅在 reload/fresh session 后显式清理。

const PLUGIN_ID = 'enterprise-harness@enterprise-harness';
const MARKETPLACE = 'enterprise-harness';
const help = process.argv.includes('--help') || process.argv.includes('-h');
const dryRun = process.argv.includes('--dry-run');
const pruneOld = process.argv.includes('--prune-old');

if (help) {
  console.log('Enterprise Harness Update-Local');
  console.log('Usage: node runtime/cli.mjs update-local [--dry-run] [--prune-old]');
  console.log('更新本地安装的 enterprise-harness 插件；默认保留旧缓存，避免活动会话 hook 路径失效。');
  console.log('  --dry-run   只报告将要执行的动作，不实际更新或删除');
  console.log('  --prune-old 显式删除非当前版本缓存；仅在 /reload-plugins 或新会话后使用');
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

// 规划 installPath 之外的旧版本缓存；默认保留，显式 --prune-old 才删除。
function cacheCleanupPlan(keepPath) {
  return planCacheCleanup(listVersionDirs(cacheRoot), cacheRoot, keepPath, { pruneOld });
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
  const plan = cacheCleanupPlan(before.entry.installPath);
  for (const item of plan.retain) console.log(`- [dry-run] 将保留旧缓存：${item.version}`);
  for (const item of plan.remove) console.log(`- [dry-run] 将删除旧缓存：${item.version}`);
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

// 4. 复核版本是否真的变化。复核失败时不猜测当前 installPath，也不清理缓存。
const after = readInstalled();
if (after.error) {
  console.error(`BLOCK: 更新后无法复核已安装插件：${after.error}`);
  console.error('恢复：保留全部缓存，确认 claude plugin list --json 可用后重试。');
  process.exit(2);
}
if (!after.entry) {
  console.error(`BLOCK: 更新后无法复核 ${PLUGIN_ID} 的安装条目。`);
  console.error('恢复：保留全部缓存，重新安装插件后重试。');
  process.exit(2);
}
const toVersion = after.entry.version;
if (toVersion === fromVersion) {
  console.log(`- 已是最新：${toVersion}（无版本变化）`);
} else {
  console.log(`- 已更新：${fromVersion} -> ${toVersion}`);
}

// 5. 活动会话可能仍持有更新前的 CLAUDE_PLUGIN_ROOT。默认保留旧缓存，避免 hook
// 命令在 reload 前因 MODULE_NOT_FOUND 失效；仅由显式 --prune-old 清理。
const keepPath = after.entry.installPath;
const cleanup = cacheCleanupPlan(keepPath);
for (const item of cleanup.retain) {
  console.log(`- 已保留旧缓存：${item.version}（兼容尚未 reload 的活动会话）`);
}
let removed = 0;
for (const item of cleanup.remove) {
  try {
    fs.rmSync(item.dir, { recursive: true, force: true });
    console.log(`- 已清理旧缓存：${item.version}`);
    removed += 1;
  } catch (e) {
    console.error(`- 警告：清理 ${item.version} 失败：${e.message}`);
  }
}
if (cleanup.retain.length === 0 && cleanup.remove.length === 0) {
  console.log('- 无旧缓存需要处理。');
}
if (pruneOld && cleanup.remove.length > 0 && removed === 0) {
  console.error('- 警告：未能清理任何旧缓存。');
}

console.log('Update-local complete. 请执行 /reload-plugins；若仍引用旧版本，请启动全新 Claude Code 会话。');
if (!pruneOld && cleanup.retain.length > 0) {
  console.log('确认 reload 或新会话生效后，可运行 update-local --prune-old 清理保留的旧缓存。');
}
process.exit(0);
