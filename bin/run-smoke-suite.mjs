import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const testDir = path.join(root, 'harness', 'plugin', 'runtime', 'test');
const ONLINE_TESTS = new Set(['plugin-install-flow-smoke.mjs']);
const tests = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('-smoke.mjs') && !ONLINE_TESTS.has(name))
  .sort();
const failures = [];
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(testDir, test), 'verify'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  if (result.status !== 0) {
    failures.push({
      test,
      status: result.status,
      output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    });
  }
}
if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL ${failure.test} exit=${failure.status}`);
    console.error(failure.output);
  }
  process.exit(1);
}
console.log(`PASS smoke suite (${tests.length} files)`);
