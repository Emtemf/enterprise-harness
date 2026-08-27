import fs from 'node:fs';
import path from 'node:path';
import {
  appendDecisionEvent,
  clarifyDecisionSnapshotPath,
  readDecisionEvents,
  sealClarifyDecisionSnapshot,
} from '../core/decision-ledger.mjs';
import {
  debtAssessmentPath,
  projectContractAssessmentPath,
  writeDebtAssessment,
  writeProjectContractAssessment,
} from '../core/clarify-assessments.mjs';
import { classifyClarify, writeClassificationArtifact } from '../core/classification-artifact.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { readClarifyResearchEvidence } from '../lib/clarify-research-evidence.mjs';

const TIER_VALUES = Object.freeze({
  L0: [0, 0, 1, 0],
  L1: [1, 1, 1, 1],
  L2: [2, 2, 2, 1],
  L3: [3, 3, 2, 2],
});

export function appendLaneApplicabilityFixture(root, changeId, requirementsRef, selections = {}) {
  const digest = sha256Artifact(root, requirementsRef);
  const existingTargets = new Set(readDecisionEvents(root, changeId)
    .filter(({ decisionType }) => decisionType === 'lane-applicability')
    .map(({ targetRef }) => targetRef));
  for (const lane of ['code', 'docs']) {
    const selectedOption = selections[lane] || 'not-required';
    const targetRef = `${requirementsRef}#fact-lane-${lane}#sha256=${digest}`;
    if (existingTargets.has(targetRef)) continue;
    appendDecisionEvent(root, changeId, {
      eventVersion: 1,
      type: 'decision-event',
      eventId: `fixture-lane-${lane}-${digest.slice(0, 12)}`,
      changeId,
      stage: 'clarify',
      actor: { type: 'runtime', id: 'test-fixture' },
      decisionType: 'lane-applicability',
      targetRef,
      questionId: `fixture-lane-${lane}-${digest.slice(0, 12)}-applicability`,
      options: ['required', 'not-required'],
      recommendedOption: selectedOption,
      selectedOption,
      publicRationale: `Fixture ${lane} lane is ${selectedOption}.`,
      evidenceRefs: [requirementsRef],
      inputDigests: { [requirementsRef]: digest },
      recordedAt: '2026-08-25T00:00:00.000Z',
    });
  }
}

export function classificationV2Fixture(root, changeId, input = {}, suffix = null) {
  const refreshAuthoritative = input.refreshAuthoritative === true;
  const requestedTier = input.tier || input.decision?.tier || 'L1';
  const values = TIER_VALUES[requestedTier];
  if (!values) throw new Error(`unsupported fixture tier ${requestedTier}`);
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const requirementsPath = path.join(root, requirementsRef);
  fs.mkdirSync(path.dirname(requirementsPath), { recursive: true });
  if (!fs.existsSync(requirementsPath)) fs.writeFileSync(requirementsPath, '# Requirements\n', 'utf-8');
  const requirements = fs.readFileSync(requirementsPath, 'utf-8');
  if (!requirements.includes('## 事实探索门禁')) {
    fs.appendFileSync(requirementsPath, [
      '',
      '## 事实探索门禁',
      '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
      '|---|---|---|---|---|---|---|',
      '| code | no | none | none | none | not-required | Fixture requires no code facts. |',
      '| docs | no | none | none | none | not-required | Fixture requires no external facts. |',
      '- remaining fact uncertainty: none',
      '',
    ].join('\n'));
  }
  const currentRequirements = fs.readFileSync(requirementsPath, 'utf-8');
  appendLaneApplicabilityFixture(root, changeId, requirementsRef, {
    code: /\|\s*code\s*\|\s*yes\s*\|/iu.test(currentRequirements) ? 'required' : 'not-required',
    docs: /\|\s*docs\s*\|\s*yes\s*\|/iu.test(currentRequirements) ? 'required' : 'not-required',
  });
  const snapshotRef = clarifyDecisionSnapshotPath(changeId);
  if (refreshAuthoritative || !fs.existsSync(path.join(root, snapshotRef))) {
    const eventId = `fixture-scope-${suffix || 'initial'}`;
    const scopeTarget = `${requirementsRef}#sha256=${sha256Artifact(root, requirementsRef)}`;
    const existingScope = readDecisionEvents(root, changeId).find((event) => (
      event.decisionType === 'scope-confirmation' && event.targetRef === scopeTarget
    ));
    if (!existingScope) appendDecisionEvent(root, changeId, {
      eventVersion: 1,
      type: 'decision-event',
      eventId,
      changeId,
      stage: 'clarify',
      actor: { type: 'user', id: 'test-user' },
      decisionType: 'scope-confirmation',
      targetRef: scopeTarget,
      questionId: `question-${eventId}`,
      options: ['confirm', 'revise'],
      recommendedOption: 'confirm',
      selectedOption: 'confirm',
      publicRationale: 'Fixture scope confirmed.',
      evidenceRefs: [requirementsRef],
      inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
      recordedAt: '2026-08-25T00:00:00.000Z',
    });
    sealClarifyDecisionSnapshot(root, changeId, readDecisionEvents(root, changeId).map(({ eventId: id }) => id));
  }
  const debtRef = debtAssessmentPath(changeId);
  if (refreshAuthoritative || !fs.existsSync(path.join(root, debtRef))) {
    writeDebtAssessment(root, changeId, {
      assessmentVersion: 1,
      type: 'debt-assessment',
      changeId,
      observations: [],
      dispositions: [],
      inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
      updatedAt: '2026-08-25T00:01:00.000Z',
    });
  }
  const instructionRef = 'CLAUDE.md';
  if (!fs.existsSync(path.join(root, instructionRef))) fs.writeFileSync(path.join(root, instructionRef), '# Fixture instructions\n');
  const contractRef = projectContractAssessmentPath(changeId);
  if (refreshAuthoritative || !fs.existsSync(path.join(root, contractRef))) {
    writeProjectContractAssessment(root, changeId, {
      assessmentVersion: 1,
      type: 'project-contract-assessment',
      changeId,
      files: [{
        path: instructionRef,
        digest: sha256Artifact(root, instructionRef),
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
        [instructionRef]: sha256Artifact(root, instructionRef),
      },
      updatedAt: '2026-08-25T00:02:00.000Z',
    });
  }
  const ordinal = suffix || String(readDecisionEvents(root, changeId).length + 1);
  const researchRefs = readClarifyResearchEvidence(root, changeId, requirementsRef, currentRequirements).refs;
  const inputDigests = Object.fromEntries([
    requirementsRef,
    snapshotRef,
    debtRef,
    contractRef,
    ...researchRefs,
  ].map((reference) => [reference, sha256Artifact(root, reference)]));
  const names = ['functionalSize', 'uncertainty', 'changeRisk', 'verificationDifficulty'];
  const scores = Object.fromEntries(names.map((name, index) => [name, {
    value: values[index],
    evidenceRefs: [requirementsRef],
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
    evidenceRefs: Object.keys(inputDigests),
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
