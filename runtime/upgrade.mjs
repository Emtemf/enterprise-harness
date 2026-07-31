import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { migrateEvidencePolicy } from './migrate-evidence-policy.mjs';

const help = process.argv.includes('--help') || process.argv.includes('-h');
const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'harness', 'plugin', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

if (help) {
  console.log('Enterprise Harness Upgrade');
  console.log('Usage: node runtime/upgrade.mjs');
  console.log('Shows the recommended runtime upgrade sequence for the current manifest version.');
  process.exit(0);
}

console.log('Enterprise Harness Upgrade');
console.log(`Target runtime version: ${manifest.version}`);
try {
  const policy = migrateEvidencePolicy(repoRoot, { write: true });
  console.log(policy.created
    ? `Created sealed evidence policy: ${policy.path}`
    : `Evidence policy valid: ${policy.path}`);
} catch (error) {
  console.error(`BLOCK: ${error.message}`);
  process.exit(2);
}
console.log('当前阶段仅提供升级骨架，不自动修改本机 secrets 或 shell 配置。');
console.log('建议步骤:');
console.log('- 运行 node runtime/sync.mjs');
console.log('- 运行 node runtime/doctor.mjs');
console.log('- 如 schema 变化，运行 node runtime/migrate.mjs');
