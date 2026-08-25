import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  readClassificationArtifact,
  replaceClassificationArtifact,
} from '../core/classification-artifact.mjs';
import { updateChangeState } from '../core/change-state.mjs';
import { classificationV2Fixture, writeClassificationV2Fixture } from './classification-v2-fixture.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-classification-cas-'));
const changeId = 'classification-cas';
const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
const initialInput = {
  impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
  decision: { tier: 'L1' },
};

try {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const initialReference = writeClassificationV2Fixture(root, changeId, initialInput, 'initial');
  const initialClassification = readClassificationArtifact(root, changeId, initialReference);
  fs.writeFileSync(statePath, `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: initialReference },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);

  const replacement = classificationV2Fixture(root, changeId, {
    tier: 'L1',
    impact: { ...initialClassification.impact, api: 'yes' },
  }, 'replacement');
  assert.throws(
    () => replaceClassificationArtifact(root, changeId, replacement, (reference) => {
      updateChangeState(root, changeId, (state) => ({ ...state, currentTask: 'concurrent-task' }), {
        expectedRevision: 1,
        type: 'concurrent-state-update',
      });
      return updateChangeState(root, changeId, (state) => ({
        ...state,
        artifacts: { ...state.artifacts, classification: reference },
      }), {
        expectedRevision: 1,
        type: 'stale-classification-update',
      });
    }),
    /EH-STATE-REVISION-014/u,
  );

  const afterConflict = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  assert.equal(afterConflict.revision, 2);
  assert.equal(afterConflict.currentTask, 'concurrent-task');
  assert.deepEqual(afterConflict.artifacts.classification, initialReference);
  assert.deepEqual(
    readClassificationArtifact(root, changeId, afterConflict.artifacts.classification),
    initialClassification,
    'failed classification CAS must restore the artifact referenced by the winning state',
  );

  const committed = replaceClassificationArtifact(root, changeId, replacement, (reference) => (
    updateChangeState(root, changeId, (state) => ({
      ...state,
      artifacts: { ...state.artifacts, classification: reference },
    }), {
      expectedRevision: 2,
      type: 'classification-artifact-updated',
    })
  ));
  assert.equal(committed.revision, 3);
  assert.deepEqual(readClassificationArtifact(root, changeId, committed.artifacts.classification), replacement);

  console.log(`PASS classification-artifact-cas ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
