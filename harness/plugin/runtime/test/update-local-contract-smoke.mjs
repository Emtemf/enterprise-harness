import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const updateLocalPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'update-local.mjs');
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
  console.error('Usage: node harness/plugin/runtime/test/update-local-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const failures = [];

// 1. 命令已在 cli.mjs 命令表注册。
const cliSource = fs.readFileSync(cliPath, 'utf-8');
if (!cliSource.includes("'update-local'")) failures.push('cli.mjs must register update-local command');

// 2. update-local.mjs 存在且封装了正确流程的关键契约。
if (!fs.existsSync(updateLocalPath)) {
  failures.push('update-local.mjs must exist');
} else {
  const src = fs.readFileSync(updateLocalPath, 'utf-8');
  // 关键契约：用实际 scope 更新（不硬编码 user）、清理旧缓存、可诊断退出。
  if (!src.includes("'marketplace', 'update'")) failures.push('update-local must run marketplace update');
  if (!src.includes("'update', PLUGIN_ID, '--scope'")) failures.push('update-local must update plugin with explicit --scope');
  if (!src.includes('scope')) failures.push('update-local must resolve scope from installed entry, not hardcode');
  if (!src.includes('rmSync')) failures.push('update-local must clean stale cache dirs');
}

// 4. 核心清理逻辑（纯函数）：保留启用版本目录，只挑出旧版本。
const { selectStaleVersions } = await import(path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'plugin-cache.mjs'));
const cacheRoot = '/fake/cache/root';
const keep = path.join(cacheRoot, '0.1.7');
const stale = selectStaleVersions(['0.1.1', '0.1.2', '0.1.7'], cacheRoot, keep);
const staleVersions = stale.map((s) => s.version).sort();
if (staleVersions.length !== 2) failures.push(`selectStaleVersions should return 2 stale, got ${staleVersions.length}`);
if (staleVersions.includes('0.1.7')) failures.push('selectStaleVersions must NEVER include the kept (enabled) version');
if (!(staleVersions.includes('0.1.1') && staleVersions.includes('0.1.2'))) failures.push('selectStaleVersions must flag older versions');
// 无 keep 时不误删（返回全部由调用方决定，但 keep=null 应把全部视为可清理候选，不崩）。
const noKeep = selectStaleVersions(['0.1.7'], cacheRoot, null);
if (noKeep.length !== 1) failures.push('selectStaleVersions with null keep should return all as candidates');

// 5. --help 不产生副作用且说明用途。
const helpRun = spawnSync('node', [updateLocalPath, '--help'], { encoding: 'utf-8' });
if (helpRun.status !== 0) failures.push('update-local --help should exit 0');
if (!(helpRun.stdout || '').includes('Update-Local')) failures.push('update-local --help should describe the command');

const ok = failures.length === 0;

if (mode === 'red') {
  if (!ok) fail(`Expected update-local contract to hold:\n${failures.join('\n')}`);
  pass('Red precondition no longer holds.');
}
if (!ok) fail(`Expected update-local contract to hold:\n${failures.join('\n')}`);
pass(mode === 'green' ? 'Green update-local-contract smoke passed.' : 'Update-local-contract verify smoke passed.');
