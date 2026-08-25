import fs from 'node:fs';
import path from 'node:path';
import { appendDecisionEvent, readDecisionEvents } from '../core/decision-ledger.mjs';
import { classifyClarify, writeClassificationArtifact } from '../core/classification-artifact.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const TIER_VALUES = Object.freeze({
  L0: [0, 0, 1, 0],
  L1: [1, 1, 1, 1],
  L2: [2, 2, 2, 1],
  L3: [3, 3, 2, 2],
});

export function classificationV2Fixture(root, changeId, input = {}, suffix = null) {
  const requestedTier = input.tier || input.decision?.tier || 'L1';
  const values = TIER_VALUES[requestedTier];
  if (!values) throw new Error(`unsupported fixture tier ${requestedTier}`);
  const ordinal = suffix || String(readDecisionEvents(root, changeId).length + 1);
  const evidenceRef = `harness/changes/${changeId}/evidence/classification-input-${ordinal}.json`;
  const absolute = path.join(root, evidenceRef);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify({ requestedTier, fixture: true })}\n`, 'utf-8');
  const inputDigests = { [evidenceRef]: sha256Artifact(root, evidenceRef) };
  const names = ['functionalSize', 'uncertainty', 'changeRisk', 'verificationDifficulty'];
  const scores = Object.fromEntries(names.map((name, index) => [name, {
    value: values[index],
    evidenceRefs: [evidenceRef],
    reason: `Fixture evidence for ${name}.`,
  }]));
  const decisionEventId = `classification-route-${ordinal}`;
  appendDecisionEvent(root, changeId, {
    eventVersion: 1,
    type: 'decision-event',
    eventId: decisionEventId,
    changeId,
    stage: 'clarify',
    actor: { type: 'runtime', id: 'test-fixture' },
    decisionType: 'classification-route',
    targetRef: `harness/changes/${changeId}/classification.json`,
    questionId: `classification-question-${ordinal}`,
    options: ['L0', 'L1', 'L2', 'L3'],
    recommendedOption: requestedTier,
    selectedOption: requestedTier,
    publicRationale: 'Fixture route is derived from fixture scores.',
    evidenceRefs: [evidenceRef],
    inputDigests,
    recordedAt: '2026-08-25T00:00:00.000Z',
  });
  return classifyClarify(root, changeId, {
    scores,
    hardFlags: [],
    impact: {
      api: input.impact?.api ?? 'no',
      data: input.impact?.data ?? 'no',
      architecture: input.impact?.architecture ?? 'no',
      rule: input.impact?.rule ?? 'no',
      security: input.impact?.security ?? 'no',
    },
    inputDigests,
    decisionEventId,
  });
}

export function writeClassificationV2Fixture(root, changeId, input = {}, suffix = null) {
  return writeClassificationArtifact(root, changeId, classificationV2Fixture(root, changeId, input, suffix));
}
