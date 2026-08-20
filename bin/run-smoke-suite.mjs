import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createTempSandbox } from '../runtime/lib/temp-sandbox.mjs';
import { SMOKE_PROFILES } from '../runtime/test/suite-manifest.mjs';

const root = path.resolve(import.meta.dirname, '..');
const testDir = path.join(root, 'runtime', 'test');
const ONLINE_TESTS = new Set(['plugin-install-flow-smoke.mjs']);
const availableTests = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('-smoke.mjs') && !ONLINE_TESTS.has(name))
  .sort();
const profileIndex = process.argv.indexOf('--profile');
const profile = profileIndex >= 0 ? process.argv[profileIndex + 1] : 'full';
if (profileIndex >= 0 && !profile) throw new Error('--profile requires a value');
if (profile !== 'full' && !Object.hasOwn(SMOKE_PROFILES, profile)) {
  throw new Error(`unknown smoke profile "${profile}"`);
}
const tests = profile === 'full' ? availableTests : [...SMOKE_PROFILES[profile]];
for (const test of tests) {
  if (!availableTests.includes(test)) throw new Error(`smoke profile "${profile}" references missing test "${test}"`);
}
const failures = [];
const suiteSandbox = createTempSandbox('enterprise-harness-smoke-suite-');
const childEnv = {
  ...process.env,
  TMPDIR: suiteSandbox.path,
  TMP: suiteSandbox.path,
  TEMP: suiteSandbox.path,
};
delete childEnv.ENTERPRISE_HARNESS_SESSION_ID;
delete childEnv.CLAUDE_SESSION_ID;

try {
  for (const test of tests) {
    const result = spawnSync(process.execPath, [path.join(testDir, test), 'verify'], {
      cwd: root,
      encoding: 'utf-8',
      env: childEnv,
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
} finally {
  suiteSandbox.cleanup();
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL ${failure.test} exit=${failure.status}`);
    console.error(failure.output);
  }
  process.exitCode = 1;
} else {
  console.log(`PASS smoke suite profile=${profile} (${tests.length} files)`);
}
