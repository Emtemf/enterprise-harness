import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../', import.meta.url));

const doctor = spawnSync(process.execPath, [
  path.join(root, 'runtime', 'doctor.mjs'),
  '--json',
], {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
  env: { ...process.env, PATH: '' },
});
const doctorResult = JSON.parse(doctor.stdout);
const context7 = doctorResult.checks.find((check) => check.name === 'context7-cli-runtime');
assert.equal(context7.status, 'not-run');
assert.match(context7.detail, /does not access Context7/u);

const upstream = spawnSync(process.execPath, [
  path.join(root, 'runtime', 'upstream-check.mjs'),
  '--json',
], {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
  env: { ...process.env, PATH: '' },
});
const upstreamResult = JSON.parse(upstream.stdout);
const upstreamContext7 = upstreamResult.checks.find((check) => check.name === 'Context7');
assert.equal(upstreamContext7.status, 'online-check-not-run');
assert.equal(upstreamContext7.ok, null);
assert.ok(upstreamResult.checks
  .filter((check) => check.kind === 'reference-upstream')
  .every((check) => check.ok === null && check.status === 'manual-review-required'));
console.log(`PASS offline-diagnostics ${mode}`);
