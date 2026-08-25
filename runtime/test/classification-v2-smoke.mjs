import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { appendDecisionEvent } from '../core/decision-ledger.mjs';
import {
  classifyClarify,
  deriveClassificationTier,
  readClassificationArtifact,
  validateClassificationArtifact,
  writeClassificationArtifact,
} from '../core/classification-artifact.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-classification-v2-'));
const changeId = 'classification-v2';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const snapshotRef = `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`;

try {
  fs.mkdirSync(path.join(root, path.dirname(snapshotRef)), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n');
  fs.writeFileSync(path.join(root, snapshotRef), '{"sealed":true}\n');
  const inputDigests = {
    [requirementsRef]: sha256Artifact(root, requirementsRef),
    [snapshotRef]: sha256Artifact(root, snapshotRef),
  };
  const score = (value, reason) => ({ value, evidenceRefs: [requirementsRef], reason });
  const scores = {
    functionalSize: score(1, 'One bounded component.'),
    uncertainty: score(1, 'All decisions are sealed.'),
    changeRisk: score(1, 'No destructive change.'),
    verificationDifficulty: score(1, 'Focused checks exist.'),
  };
  const impact = { api: 'no', data: 'no', architecture: 'no', rule: 'yes', security: 'no' };
  const decisionEventId = 'classification-route-1';
  appendDecisionEvent(root, changeId, {
    eventVersion: 1,
    type: 'decision-event',
    eventId: decisionEventId,
    changeId,
    stage: 'clarify',
    actor: { type: 'runtime', id: 'classification-runtime' },
    decisionType: 'classification-route',
    targetRef: `harness/changes/${changeId}/classification.json`,
    questionId: 'classification-route-question',
    options: ['L0', 'L1', 'L2', 'L3'],
    recommendedOption: 'L1',
    selectedOption: 'L1',
    publicRationale: 'The evidence-derived total selects L1.',
    evidenceRefs: [requirementsRef, snapshotRef],
    inputDigests,
    recordedAt: '2026-08-25T00:00:00.000Z',
  });

  for (const [values, hardFlags, expected] of [
    [{ functionalSize: 0, uncertainty: 0, changeRisk: 1, verificationDifficulty: 0 }, [], 'L0'],
    [{ functionalSize: 1, uncertainty: 1, changeRisk: 1, verificationDifficulty: 1 }, [], 'L1'],
    [{ functionalSize: 2, uncertainty: 2, changeRisk: 2, verificationDifficulty: 1 }, [], 'L2'],
    [{ functionalSize: 3, uncertainty: 3, changeRisk: 2, verificationDifficulty: 2 }, [], 'L3'],
    [{ functionalSize: 0, uncertainty: 0, changeRisk: 0, verificationDifficulty: 0 }, ['irreversible-data-migration'], 'L3'],
    [{ functionalSize: 0, uncertainty: 0, changeRisk: 0, verificationDifficulty: 0 }, ['security-boundary'], 'L2'],
  ]) {
    assert.equal(deriveClassificationTier(values, hardFlags).tier, expected);
  }

  const classification = classifyClarify(root, changeId, {
    scores,
    hardFlags: [],
    impact,
    inputDigests,
    decisionEventId,
  });
  assert.deepEqual(classification, {
    classificationVersion: 2,
    type: 'clarify-classification',
    changeId,
    scores,
    total: 4,
    tier: 'L1',
    hardFlags: [],
    impact,
    inputDigests,
    decisionEventId,
  });
  assert.deepEqual(validateClassificationArtifact(root, changeId, classification), []);
  const reference = writeClassificationArtifact(root, changeId, classification);
  assert.deepEqual(readClassificationArtifact(root, changeId, reference), classification);

  assert.match(validateClassificationArtifact(root, changeId, { ...classification, total: 5 }).join('\n'), /total/u);
  const missingEvidence = structuredClone(classification);
  missingEvidence.scores.functionalSize.evidenceRefs = [];
  assert.match(validateClassificationArtifact(root, changeId, missingEvidence).join('\n'), /evidenceRefs/u);
  assert.match(validateClassificationArtifact(root, changeId, { ...classification, hardFlags: ['unknown'] }).join('\n'), /hardFlags/u);
  assert.notDeepEqual(validateClassificationArtifact(root, changeId, { impact, decision: { tier: 'L1' } }), []);
  assert.throws(
    () => classifyClarify(root, changeId, { ...classification, decisionEventId: 'missing-route' }),
    /EH-CLASSIFICATION-ROUTE-128/u,
  );
  assert.throws(
    () => writeClassificationArtifact(root, changeId, { ...classification, tier: 'L2', total: 7 }),
    /EH-CLASSIFICATION/u,
  );

  fs.appendFileSync(path.join(root, requirementsRef), 'changed\n');
  assert.match(
    validateClassificationArtifact(root, changeId, classification).join('\n'),
    /input digest is stale/u,
  );
  assert.throws(
    () => readClassificationArtifact(root, changeId, reference),
    /EH-CLASSIFICATION-STALE-129/u,
  );

  console.log(`PASS classification-v2 ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
