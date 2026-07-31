import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const tests = [
  'artifact-content-smoke.mjs',
  'offline-diagnostics-smoke.mjs',
  'hook-manifest-parity-smoke.mjs',
  'release-version-acceptance-smoke.mjs',
  'release-notes-smoke.mjs',
  'current-doc-surface-smoke.mjs',
  'docs-consistency-smoke.mjs',
];
let failed = false;
for (const file of tests) {
  const child = spawnSync(process.execPath, [path.join(testDir, file), 'verify'], { cwd: process.cwd(), encoding: 'utf-8', shell: false, env: { ...process.env } });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) failed = true;
}
if (failed) process.exit(1);
console.log(`PASS task4-release-acceptance ${mode}`);
