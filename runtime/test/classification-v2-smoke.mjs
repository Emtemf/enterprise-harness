import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { appendDecisionEvent, readDecisionEvents, sealClarifyDecisionSnapshot } from '../core/decision-ledger.mjs';
import {
  debtAssessmentPath,
  projectContractAssessmentPath,
  writeDebtAssessment,
  writeProjectContractAssessment,
} from '../core/clarify-assessments.mjs';
import {
  classifyClarify,
  deriveClassificationTier,
  readClassificationArtifact,
  validateClassificationArtifact,
  writeClassificationArtifact,
} from '../core/classification-artifact.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendLaneApplicabilityFixture, ensureRequiredCodeResearchFixture } from './classification-v2-fixture.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';
import { readClarifyResearchEvidence } from '../lib/clarify-research-evidence.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-classification-v2-'));
const changeId = 'classification-v2';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const snapshotRef = `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`;
const debtRef = debtAssessmentPath(changeId);
const contractRef = projectContractAssessmentPath(changeId);

try {
  fs.mkdirSync(path.join(root, path.dirname(snapshotRef)), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), [
    '# Requirements',
    '## 目标与验收',
    '### 原始需求',
    'Classify a bounded fixture change.',
    '### 澄清后的目标',
    'Classify the current change.',
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | No code facts required. |',
    '| docs | no | none | none | none | not-required | No external facts required. |',
    '- remaining fact uncertainty: none',
    '',
  ].join('\n'));
  recordPromptReceipt(root, { session_id: 'classification-v2-prompt', prompt: 'Classify a bounded fixture change.' });
  bindLatestPromptReceipt(root, changeId, 'classification-v2-prompt');
  ensureRequiredCodeResearchFixture(root, changeId, requirementsRef);
  appendLaneApplicabilityFixture(root, changeId, requirementsRef);
  appendDecisionEvent(root, changeId, {
    eventVersion: 1,
    type: 'decision-event',
    eventId: 'scope-confirmation-1',
    changeId,
    stage: 'clarify',
    actor: { type: 'user', id: 'maintainer' },
    decisionType: 'scope-confirmation',
    targetRef: requirementsRef,
    questionId: 'scope-question',
    options: ['confirm', 'revise'],
    recommendedOption: 'confirm',
    selectedOption: 'confirm',
    publicRationale: 'Scope confirmed.',
    evidenceRefs: [requirementsRef],
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    recordedAt: '2026-08-25T00:00:00.000Z',
  });
  sealClarifyDecisionSnapshot(root, changeId, readDecisionEvents(root, changeId).map(({ eventId }) => eventId));
  writeDebtAssessment(root, changeId, {
    assessmentVersion: 1,
    type: 'debt-assessment',
    changeId,
    observations: [],
    dispositions: [],
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    updatedAt: '2026-08-25T00:01:00.000Z',
  });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Project instructions\n');
  writeProjectContractAssessment(root, changeId, {
    assessmentVersion: 1,
    type: 'project-contract-assessment',
    changeId,
    files: [{
      path: 'CLAUDE.md',
      digest: sha256Artifact(root, 'CLAUDE.md'),
      scope: 'project',
      ownership: 'project',
    }],
    gaps: [],
    conflicts: [],
    status: 'use-existing',
    decisionEventId: null,
    proposalRef: null,
    inputDigests: {
      [requirementsRef]: sha256Artifact(root, requirementsRef),
      'CLAUDE.md': sha256Artifact(root, 'CLAUDE.md'),
    },
    updatedAt: '2026-08-25T00:02:00.000Z',
  });
  const researchRefs = readClarifyResearchEvidence(
    root, changeId, requirementsRef, fs.readFileSync(path.join(root, requirementsRef), 'utf-8'),
  ).refs;
  const inputDigests = {
    [requirementsRef]: sha256Artifact(root, requirementsRef),
    [snapshotRef]: sha256Artifact(root, snapshotRef),
    [debtRef]: sha256Artifact(root, debtRef),
    [contractRef]: sha256Artifact(root, contractRef),
    ...Object.fromEntries(researchRefs.map((ref) => [ref, sha256Artifact(root, ref)])),
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

  const routeEvent = (eventId, digests) => appendDecisionEvent(root, changeId, {
    eventVersion: 1,
    type: 'decision-event',
    eventId,
    changeId,
    stage: 'clarify',
    actor: { type: 'runtime', id: 'classification-runtime' },
    decisionType: 'classification-route',
    targetRef: `harness/changes/${changeId}/classification.json`,
    questionId: `question-${eventId}`,
    options: ['L0', 'L1', 'L2', 'L3'],
    recommendedOption: 'L1',
    selectedOption: 'L1',
    publicRationale: 'Derived route.',
    evidenceRefs: Object.keys(digests),
    inputDigests: digests,
    recordedAt: '2026-08-25T00:03:00.000Z',
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

  const omittedDigests = { ...inputDigests };
  delete omittedDigests[debtRef];
  routeEvent('classification-route-omitted', omittedDigests);
  assert.match(
    validateClassificationArtifact(root, changeId, {
      ...classification,
      inputDigests: omittedDigests,
      decisionEventId: 'classification-route-omitted',
    }).join('\n'),
    /debt-assessment\.json.*required|authoritative classification input is missing/u,
  );

  const otherRequirementsRef = 'harness/changes/other-change/requirements.md';
  fs.mkdirSync(path.dirname(path.join(root, otherRequirementsRef)), { recursive: true });
  fs.writeFileSync(path.join(root, otherRequirementsRef), '# Other requirements\n');
  const crossChangeDigests = { ...inputDigests };
  delete crossChangeDigests[requirementsRef];
  crossChangeDigests[otherRequirementsRef] = sha256Artifact(root, otherRequirementsRef);
  routeEvent('classification-route-cross-change', crossChangeDigests);
  assert.match(
    validateClassificationArtifact(root, changeId, {
      ...classification,
      scores: Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, {
        ...value,
        evidenceRefs: [otherRequirementsRef],
      }])),
      inputDigests: crossChangeDigests,
      decisionEventId: 'classification-route-cross-change',
    }).join('\n'),
    /requirements\.md.*required|same-change canonical/u,
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
