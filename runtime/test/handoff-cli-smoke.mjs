import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-cli-'));
const changeId = 'cli-probe';
fs.mkdirSync(path.join(root, 'harness/changes', changeId, 'briefs'), { recursive: true });
fs.copyFileSync(
  path.join(sourceRoot, 'runtime/test/fixtures/behavior-checks.json'),
  path.join(root, 'harness/behavior-checks.json'),
);
fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
fs.writeFileSync(path.join(root, 'harness/changes', changeId, 'briefs/design.md'), '# Design brief\n');

try {
  const run = spawnSync('node', [
    path.join(sourceRoot, 'runtime/handoff.mjs'),
    'create',
    changeId,
    'design',
    'design.produce',
    'execute',
    '--input-ref',
    `harness/changes/${changeId}/briefs/design.md`,
    '--target',
    'produce design',
  ], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /HANDOFF_INPUT=/);
  assert.match(run.stdout, /agent=enterprise-harness:design-executor/);
  assert.match(run.stdout, /skill=harness/);
  const marker = run.stdout.match(/HANDOFF_INPUT=([^\n]+)/)?.[1];
  assert.ok(marker);
  const input = JSON.parse(fs.readFileSync(path.join(root, marker), 'utf-8'));
  assert.equal(input.tecpc.target, 'produce design');
  assert.ok(input.inputDigests[`harness/changes/${changeId}/briefs/design.md`]);
  console.log(`PASS handoff-cli ${process.argv[2] || 'verify'}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
