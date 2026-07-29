import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const tests = ['release-version-acceptance-smoke.mjs', 'claude-plugin-live-e2e.mjs'];
let failed = false;
for (const file of tests) {
  const child = spawnSync(process.execPath, [path.join(testDir, file), 'verify'], { cwd: process.cwd(), encoding: 'utf-8', shell: false, env: { ...process.env, HARNESS_LIVE_E2E: file.includes('live-e2e') ? '' : process.env.HARNESS_LIVE_E2E } });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) failed = true;
}
if (mode === 'red') {
  console.error('RED: Task 4 requires consistent projections and blocking release acceptance');
  process.exit(1);
}
if (failed) process.exit(1);
console.log(`PASS task4-release-acceptance ${mode}`);
