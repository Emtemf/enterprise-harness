import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createEvidencePolicy,
  evidencePolicyDigest,
  evidencePolicySealPath,
  readEvidencePolicy,
  validateEvidencePolicy,
} from '../lib/evidence-policy.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-policy-'));
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
};
git('init', '-q');
git('config', 'user.email', 'harness@example.invalid');
git('config', 'user.name', 'Harness Smoke');
fs.mkdirSync(path.join(root, 'harness/changes/legacy-change'), { recursive: true });
fs.writeFileSync(path.join(root, 'harness/changes/legacy-change/state.json'), '{}\n');
fs.mkdirSync(path.join(root, 'harness/changes/current-change'), { recursive: true });
fs.writeFileSync(path.join(root, 'harness/changes/current-change/state.json'), '{}\n');
git('add', '.');
git('commit', '-qm', 'baseline');
fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), 'current-change\n');
fs.mkdirSync(path.join(root, 'harness/changes/uncommitted-change'), { recursive: true });
fs.writeFileSync(path.join(root, 'harness/changes/uncommitted-change/state.json'), '{}\n');

const created = createEvidencePolicy(root);
assert.equal(created.created, true);
assert.deepEqual(created.policy.legacyChangeIds, ['legacy-change']);
assert.equal(created.policy.strictByDefault, true);
assert.equal(created.policy.sealed, true);
assert.equal(fs.existsSync(evidencePolicySealPath(root)), true);
assert.deepEqual(validateEvidencePolicy(root, created.policy), []);
assert.equal(readEvidencePolicy(root).ok, true);
git('add', 'harness/evidence-policy.json');
git('commit', '-qm', 'seal evidence policy');
assert.throws(() => createEvidencePolicy(root), /sealed|already exists/i, 'registry is create-once');

const injected = {
  ...created.policy,
  legacyChangeIds: [...created.policy.legacyChangeIds, 'not-in-baseline'],
};
delete injected.contentDigest;
assert.notDeepEqual(
  validateEvidencePolicy(root, injected),
  [],
  'legacy id absent from baseline must fail',
);

const tampered = JSON.parse(fs.readFileSync(path.join(root, 'harness/evidence-policy.json'), 'utf-8'));
tampered.strictByDefault = false;
assert.notDeepEqual(validateEvidencePolicy(root, tampered), [], 'sealed content must reject tampering');
fs.writeFileSync(
  path.join(root, 'harness/evidence-policy.json'),
  `${JSON.stringify(tampered, null, 2)}\n`,
);
assert.equal(readEvidencePolicy(root).ok, false, 'reader must not bless a tampered registry');
const resealed = JSON.parse(fs.readFileSync(path.join(root, 'harness/evidence-policy.json'), 'utf-8'));
resealed.strictByDefault = true;
resealed.legacyChangeIds.push('current-change');
resealed.legacyChangeIds.sort();
resealed.contentDigest = evidencePolicyDigest(resealed);
fs.writeFileSync(
  path.join(root, 'harness/evidence-policy.json'),
  `${JSON.stringify(resealed, null, 2)}\n`,
);
assert.equal(
  readEvidencePolicy(root).ok,
  false,
  'recomputing the self-contained digest must not downgrade a strict change',
);
console.log(`PASS evidence-policy-contract ${process.argv[2] || 'verify'}`);
