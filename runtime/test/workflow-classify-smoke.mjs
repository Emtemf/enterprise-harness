import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classificationFor } from '../lib/workflow.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';

const workflow = await import('../lib/workflow.mjs');
assert.equal(workflow.classifyChange, undefined, 'production must not export a loose classification authority');

assert.throws(
  () => classificationFor({ classification: { tier: 'L1', impact: {}, workflowTopology: 'legacy' } }),
  /EH-CLASSIFICATION-AUTHORITY-005/u,
);
assert.throws(
  () => classificationFor({ tier: 'L1', impact: { api: 'no' } }),
  /EH-CLASSIFICATION-AUTHORITY-005/u,
);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-classify-v2-'));
const changeId = 'strict-authority';
const written = writeClassificationV2Fixture(root, changeId, { tier: 'L2' });
const state = {
  schemaVersion: 6,
  stage: 'clarify',
  artifacts: { classification: { path: written.path, digest: written.digest } },
};
const loaded = classificationFor(state, root, changeId);
assert.equal(loaded.tier, 'L2');
assert.equal(loaded.changeId, changeId);

const orphanState = { ...state, artifacts: { classification: null } };
assert.equal(classificationFor(orphanState, root, changeId), null);

console.log('PASS workflow-classify verify');
