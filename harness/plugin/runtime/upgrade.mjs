import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'harness', 'plugin', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

console.log('Enterprise Harness Upgrade');
console.log(`Target runtime version: ${manifest.version}`);
console.log('当前阶段仅提供升级骨架，不自动修改本机 secrets 或 shell 配置。');
console.log('建议步骤:');
console.log('- 运行 node harness/plugin/runtime/sync.mjs');
console.log('- 运行 node harness/plugin/runtime/doctor.mjs');
console.log('- 如 schema 变化，运行 node harness/plugin/runtime/migrate.mjs');
