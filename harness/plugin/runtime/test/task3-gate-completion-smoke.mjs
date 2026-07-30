import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const tests = [
  'safe-paths-adversarial-smoke.mjs',
  'hook-snapshot-attribution-smoke.mjs',
  'state-store-concurrency-smoke.mjs',
  'completion-layers-smoke.mjs',
  'checks-openapi-scan-unit-smoke.mjs',
  'openapi-controller-consistency-smoke.mjs',
  'gates-governed-target-unit-smoke.mjs',
  'cumulative-write-gate-smoke.mjs',
  'task-review-binding-smoke.mjs',
  'archive-completion-smoke.mjs',
];
let failed = false;
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(testDir, test), 'verify'], { cwd: process.cwd(), encoding: 'utf-8', shell: false });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
console.log(`PASS task3-gate-completion ${mode}`);
