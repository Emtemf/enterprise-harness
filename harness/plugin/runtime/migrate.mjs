import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { readLocalAdapter } from './lib/local-adapter.mjs';

const help = process.argv.includes('--help') || process.argv.includes('-h');

if (help) {
  console.log('Enterprise Harness Migrate');
  console.log('Usage: node harness/plugin/runtime/migrate.mjs [--write]');
  console.log('Checks the local adapter schema and optionally rewrites missing fields from the example file.');
  process.exit(0);
}

const localAdapter = readLocalAdapter();
console.log('Enterprise Harness Migrate');
if (!localAdapter.exists) {
  console.log(`未检测到本机 adapter：${localAdapter.path}`);
  console.log('先运行 node harness/plugin/runtime/setup-local-adapter.mjs --write');
  process.exit(0);
}

const data = localAdapter.data || {};
console.log(`Local adapter path: ${localAdapter.path}`);
console.log(`schemaVersion: ${data.schemaVersion ?? 'missing'}`);
console.log(`runtimeVersion: ${data.runtimeVersion ?? 'missing'}`);
if (localAdapter.errors.length === 0) {
  console.log('本机 adapter 已符合当前 schema。');
  process.exit(0);
}
if (!process.argv.includes('--write')) {
  console.log(`发现可迁移问题：${localAdapter.errors.join('; ')}`);
  console.log('传入 --write 可按当前 example 自动补齐缺失字段。');
  process.exit(0);
}
const migrate = spawnSync('node', ['harness/plugin/runtime/setup-local-adapter.mjs', '--write'], { cwd: process.cwd(), encoding: 'utf-8' });
process.stdout.write(migrate.stdout || '');
process.stderr.write(migrate.stderr || '');
process.exit(migrate.status ?? 1);
