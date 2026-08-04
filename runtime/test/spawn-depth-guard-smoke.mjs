import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  evaluateSpawnDepth,
  REQUIRED_SPAWN_DEPTH,
  SPAWN_DEPTH_ENV,
} from '../lib/spawn-depth.mjs';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../', import.meta.url));

const unset = evaluateSpawnDepth({});
assert.equal(unset.ok, null);
assert.equal(unset.status, 'unset');
assert.match(unset.detail, /静默/u);

const tooLow = evaluateSpawnDepth({ [SPAWN_DEPTH_ENV]: '1' });
assert.equal(tooLow.ok, false);
assert.equal(tooLow.status, 'too-low');
assert.equal(tooLow.severity, 'error');

const invalid = evaluateSpawnDepth({ [SPAWN_DEPTH_ENV]: 'yes' });
assert.equal(invalid.ok, false);
assert.equal(invalid.status, 'invalid');

const atMinimum = evaluateSpawnDepth({ [SPAWN_DEPTH_ENV]: String(REQUIRED_SPAWN_DEPTH) });
assert.equal(atMinimum.ok, true);
assert.equal(atMinimum.value, REQUIRED_SPAWN_DEPTH);

// The generated project settings must keep the guard the forked stages rely on.
const settings = JSON.parse(
  spawnSync(process.execPath, ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(path.join(root, '.claude', 'settings.json'))}, 'utf-8'))`], {
    encoding: 'utf-8',
    shell: false,
  }).stdout,
);
assert.ok(
  Number(settings.env?.[SPAWN_DEPTH_ENV]) >= REQUIRED_SPAWN_DEPTH,
  `.claude/settings.json must pin ${SPAWN_DEPTH_ENV} >= ${REQUIRED_SPAWN_DEPTH}`,
);

function doctorCheck(env) {
  const result = spawnSync(process.execPath, [
    path.join(root, 'runtime', 'doctor.mjs'),
    '--json',
  ], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env,
  });
  const parsed = JSON.parse(result.stdout);
  return parsed.checks.find((check) => check.name === 'subagent-spawn-depth');
}

const baseEnv = { ...process.env, PATH: '' };
delete baseEnv[SPAWN_DEPTH_ENV];

const doctorTooLow = doctorCheck({ ...baseEnv, [SPAWN_DEPTH_ENV]: '1' });
assert.equal(doctorTooLow.ok, false, 'doctor must fail loudly when spawn depth is too low');
assert.equal(doctorTooLow.severity, 'error');

const doctorOk = doctorCheck({ ...baseEnv, [SPAWN_DEPTH_ENV]: '3' });
assert.equal(doctorOk.ok, true);

const doctorUnset = doctorCheck(baseEnv);
assert.equal(doctorUnset.ok, false, 'unset depth must not silently pass doctor');
assert.equal(doctorUnset.severity, 'warn');

console.log(`PASS spawn-depth-guard ${mode}`);
