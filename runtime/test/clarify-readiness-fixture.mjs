import fs from 'node:fs';
import path from 'node:path';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';

export function approvedRequirements() {
  return [
    '# Requirements',
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | No code research needed. |',
    '| docs | no | none | none | none | not-required | No docs research needed. |',
    '- remaining fact uncertainty: none',
    '## 组件拓扑',
    '| Component | Description | Status |',
    '|---|---|---|',
    '| runtime | Workflow runtime | active |',
    '- topology confirmed: true',
    '## Component × Dimension 评分',
    '| Component | Dimension | Evidence | Score |',
    '|---|---|---|---|',
    ...['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'].map((dimension) => `| runtime | ${dimension} | requirements | 4 |`),
    '- unresolved high-risk assumption: none',
    '## 未决决策与确认',
    '- unresolved high-risk decision: none',
    '- scope confirmed: true',
    '',
  ].join('\n');
}

export function prepareClassifiedClarify(root, changeId) {
  const dir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'requirements.md'), approvedRequirements());
  const classification = writeClassificationV2Fixture(root, changeId, { tier: 'L1' });
  fs.writeFileSync(path.join(dir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6, revision: 1, changeId, lifecycle: 'active', stage: 'clarify',
    artifacts: { classification }, validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  return classification;
}

export function addClarifyCompletion(root, changeId, {
  stageStatus = 'pass',
  reviewerTrusted = true,
  reviewerMatches = true,
  tecpcCorrection = null,
  proof = 'missing',
  forgedReviewRunId = false,
} = {}) {
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const classificationRef = `harness/changes/${changeId}/classification.json`;
  const refs = [
    requirementsRef,
    classificationRef,
    `harness/changes/${changeId}/debt-assessment.json`,
    `harness/changes/${changeId}/project-contract-assessment.json`,
    `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`,
  ];
  const classificationArtifact = JSON.parse(fs.readFileSync(path.join(root, classificationRef), 'utf-8'));
  const researchRefs = Object.keys(classificationArtifact.inputDigests).filter((reference) => ![
    requirementsRef,
    refs[2],
    refs[3],
    refs[4],
  ].includes(reference));
  const frozenRefs = [...refs, ...researchRefs];
  const reviewTecpc = {
    target: 'Complete canonical Clarify artifacts', evidence: frozenRefs, context: frozenRefs,
    path: `${requirementsRef} -> ${classificationRef}`, correction: tecpcCorrection,
  };
  const stageTecpc = { ...reviewTecpc, correction: null };
  const execute = createHandoffV2(root, {
    changeId, stage: 'clarify', behavior: 'clarify.confirmed',
    agent: { type: 'enterprise-harness:main', skill: 'harness' }, inputRefs: frozenRefs, tecpc: stageTecpc,
  });
  const artifacts = refs.map((artifactPath) => ({ path: artifactPath, digest: sha256Artifact(root, artifactPath) }));
  const stageResult = {
    resultVersion: 1, type: 'stage-result', changeId, stage: 'clarify', runId: execute.runId,
    producer: { agentType: 'enterprise-harness:main', skill: 'harness' },
    inputDigests: { ...execute.input.inputDigests }, artifacts,
    assertions: [
      ['research-complete', [requirementsRef, ...researchRefs]],
      ['decisions-durable', refs[4]],
      ['technical-debt-disposed', refs[2]],
      ['project-contract-disposed', refs[3]],
      ['requirements-ready', requirementsRef],
      ['classification-ready', classificationRef],
      ['scope-confirmed', refs[4]],
    ].map(([id, reference]) => ({
      id,
      verdict: stageStatus === 'pass' ? 'pass' : 'block',
      evidence: Array.isArray(reference) ? reference : [reference],
    })),
    selfCheck: { verdict: stageStatus === 'pass' ? 'pass' : 'block', findings: stageStatus === 'pass' ? [] : ['blocked'], evidence: refs },
    tecpc: stageTecpc, status: stageStatus, needsDecision: null, completedAt: '2026-08-25T01:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), `${JSON.stringify(stageResult, null, 2)}\n`);
  if (stageStatus !== 'pass') return { execute, stageResult, check: null, review: null };
  const check = createHandoffV2(root, {
    changeId, stage: 'clarify', behavior: 'clarify.review', role: 'check', parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' }, inputRefs: frozenRefs, tecpc: reviewTecpc,
  });
  const review = {
    resultVersion: 1, type: 'review-result', changeId, stage: 'clarify',
    runId: forgedReviewRunId ? 'run_11111111-1111-4111-8111-111111111111' : check.runId,
    parentRunId: execute.runId,
    reviewer: reviewerMatches
      ? { agentType: 'enterprise-harness:reviewer', skill: 'review' }
      : { agentType: 'enterprise-harness:main', skill: 'harness' },
    reviewedRunId: execute.runId, reviewedArtifacts: artifacts, rubricIds: [...check.input.rubricIds],
    tecpc: reviewTecpc, verdict: 'pass', correction: null, reviewedAt: '2026-08-25T01:00:01.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, check.runId, 'check'), `${JSON.stringify(review, null, 2)}\n`);
  if (reviewerTrusted) appendCompletedHandoffBinding(root, changeId, check.input, { agentId: `${changeId}-reviewer` });
  if (proof !== 'missing' && reviewerTrusted && reviewerMatches && tecpcCorrection === null) {
    const candidate = buildCompletionProof(root, {
      stageResult,
      reviewResult: review,
      producerAgentIds: ['enterprise-harness:main'],
      reviewerAgentIds: [`${changeId}-reviewer`],
      createdAt: '2026-08-25T01:00:02.000Z',
    });
    const persisted = proof === 'mismatched' ? { ...candidate, target: 'generic completion' } : candidate;
    const proofPath = path.join(root, 'harness', 'changes', changeId, 'evidence', 'completion', 'clarify.json');
    fs.mkdirSync(path.dirname(proofPath), { recursive: true });
    fs.writeFileSync(proofPath, `${JSON.stringify(persisted, null, 2)}\n`);
  }
  return { execute, stageResult, check, review };
}
