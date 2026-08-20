import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SMOKE_PROFILES } from './suite-manifest.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const testDir = path.join(root, 'runtime', 'test');
for (const [profile, tests] of Object.entries(SMOKE_PROFILES)) {
  assert.ok(tests.length > 0, `${profile} profile must not be empty`);
  assert.equal(new Set(tests).size, tests.length, `${profile} profile must not contain duplicates`);
  for (const test of tests) {
    assert.ok(fs.existsSync(path.join(testDir, test)), `${profile} profile references missing ${test}`);
    assert.notEqual(test, 'plugin-install-flow-smoke.mjs', 'deterministic profiles must remain offline');
  }
}
assert.ok(SMOKE_PROFILES.skill.includes('skill-content-contract-smoke.mjs'));
assert.ok(SMOKE_PROFILES.platform.includes('task-child-process-group-smoke.mjs'));

const invalid = spawnSync(process.execPath, ['bin/run-smoke-suite.mjs', '--profile', 'unknown'], {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
});
assert.notEqual(invalid.status, 0, 'unknown profile must fail closed');
assert.match(`${invalid.stdout}${invalid.stderr}`, /unknown smoke profile "unknown"/u);

console.log(`PASS smoke-profile-contract ${process.argv[2] || 'verify'}`);
