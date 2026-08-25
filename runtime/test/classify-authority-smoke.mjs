import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classificationFor,
  inferCurrentGap,
  inferPendingDecision,
  inferWorkflowStage,
} from '../lib/workflow.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';

const changeId = 'classify-authority-probe';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-classify-authority-'));
const changeDir = path.join(root, 'harness', 'changes', changeId);
fs.mkdirSync(changeDir, { recursive: true });
try {
  const reference = writeClassificationV2Fixture(root, changeId, {
    tier: 'L3',
    impact: { api: 'yes', data: 'yes', architecture: 'yes', security: 'no' },
  });
  const classified = {
    schemaVersion: 6,
    stage: 'design',
    state: 'DISCOVERED',
    artifacts: { classification: reference },
    classification: { tier: 'L0', impact: {}, workflowTopology: 'forged loose value' },
  };

  assert.equal(inferWorkflowStage(changeId, classified), 'design');
  assert.equal(classificationFor(classified, root, changeId).tier, 'L3');
  const gap = inferCurrentGap(root, changeId, classified, 'design');
  assert.doesNotMatch(gap, /route/u);
  assert.equal(inferPendingDecision(changeId, classified, 'design', gap), null);

  assert.throws(
    () => classificationFor({ classification: classified.classification }, root, changeId),
    /EH-CLASSIFICATION-AUTHORITY-005/u,
  );

  console.log('PASS classify-authority verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
