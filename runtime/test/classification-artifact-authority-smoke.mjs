import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readClassificationArtifact,
} from '../core/classification-artifact.mjs';
import { validateV6State } from '../core/change-state.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-classification-authority-'));
const changeId = 'classification-authority';

try {
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  const legacyInput = {
    impact: {
      api: 'yes',
      data: 'no',
      architecture: 'yes',
      rule: 'no',
      security: 'no',
    },
    decision: { tier: 'L2' },
  };

  const reference = writeClassificationV2Fixture(root, changeId, legacyInput);
  const classification = readClassificationArtifact(root, changeId, reference);
  assert.deepEqual(reference, {
    path: `harness/changes/${changeId}/classification.json`,
    digest: reference.digest,
  });
  assert.match(reference.digest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(readClassificationArtifact(root, changeId, reference), classification);

  const state = {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: reference },
    validation: { status: 'missing', digest: null, validatedAt: null },
  };
  assert.deepEqual(validateV6State(state), []);

  const directTruth = {
    ...state,
    impact: classification.impact,
    classification,
    sessionBinding: null,
    changeLock: null,
  };
  assert.match(
    validateV6State(directTruth).join('; '),
    /direct business field is forbidden|session coordination field is forbidden/u,
  );

  const artifactPath = path.join(root, reference.path);
  const stale = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  stale.impact.api = 'no';
  fs.writeFileSync(artifactPath, `${JSON.stringify(stale, null, 2)}\n`, 'utf-8');
  assert.throws(
    () => readClassificationArtifact(root, changeId, reference),
    /EH-CLASSIFICATION-DIGEST-002/u,
  );

  console.log('PASS classification-artifact-authority verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
