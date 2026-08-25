import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { auditWorkflow } from '../lib/workflow-audit.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-workflow-audit-v6-'));
const changeId = 'audit-design';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const changeDir = path.join(root, 'harness', 'changes', changeId);

let state = {
  schemaVersion: 6,
  revision: 1,
  changeId,
  lifecycle: 'active',
  stage: 'plan',
  artifacts: { classification: null },
  validation: { status: 'stale', digest: null, validatedAt: null },
};

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), approvedRequirements());
  state = {
    ...state,
    artifacts: {
      ...state.artifacts,
      classification: writeClassificationArtifact(root, changeId, {
        impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
        decision: { tier: 'L1' },
      }),
    },
  };
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');

  const classificationRef = state.artifacts.classification.path;
  const requiredClarifyArtifacts = [
    requirementsRef,
    classificationRef,
    `harness/changes/${changeId}/debt-assessment.json`,
    `harness/changes/${changeId}/project-contract-assessment.json`,
    `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`,
  ];
  const clarifyTecpc = {
    target: 'confirm canonical Clarify artifacts',
    evidence: requiredClarifyArtifacts,
    context: requiredClarifyArtifacts,
    path: requiredClarifyArtifacts.join(' -> '),
    correction: null,
  };
  const clarifyExecute = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.confirmed',
    agent: { type: 'enterprise-harness:main', skill: 'harness' },
    inputRefs: requiredClarifyArtifacts,
    tecpc: clarifyTecpc,
  });
  const clarifyArtifacts = requiredClarifyArtifacts
    .map((artifactPath) => ({ path: artifactPath, digest: sha256Artifact(root, artifactPath) }));
  const clarifyResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'clarify',
    runId: clarifyExecute.runId,
    producer: { agentType: 'enterprise-harness:main', skill: 'harness' },
    inputDigests: { ...clarifyExecute.input.inputDigests },
    artifacts: clarifyArtifacts,
    assertions: [
      ['research-complete', requirementsRef],
      ['decisions-durable', requiredClarifyArtifacts[4]],
      ['technical-debt-disposed', requiredClarifyArtifacts[2]],
      ['project-contract-disposed', requiredClarifyArtifacts[3]],
      ['requirements-ready', requirementsRef],
      ['classification-ready', classificationRef],
      ['scope-confirmed', requiredClarifyArtifacts[4]],
    ].map(([id, reference]) => ({ id, verdict: 'pass', evidence: [reference] })),
    selfCheck: { verdict: 'pass', findings: [], evidence: requiredClarifyArtifacts },
    tecpc: clarifyTecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-13T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, clarifyExecute.runId), JSON.stringify(clarifyResult));
  const clarifyCheck = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'review',
    role: 'check',
    parentRunId: clarifyExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: requiredClarifyArtifacts,
    tecpc: clarifyTecpc,
  });
  const clarifyReviewPath = v2ResultPath(root, changeId, clarifyCheck.runId, 'check');
  const clarifyReview = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'clarify',
    runId: clarifyCheck.runId,
    parentRunId: clarifyExecute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: clarifyExecute.runId,
    reviewedArtifacts: clarifyArtifacts,
    rubricIds: [...clarifyCheck.input.rubricIds],
    tecpc: clarifyTecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-13T00:00:01.000Z',
  };
  fs.writeFileSync(clarifyReviewPath, JSON.stringify(clarifyReview));
  appendCompletedHandoffBinding(root, changeId, clarifyCheck.input, { agentId: 'agent-clarify-review' });

  fs.writeFileSync(v2ResultPath(root, changeId, clarifyExecute.runId), JSON.stringify({
    ...clarifyResult,
    artifacts: clarifyArtifacts.filter((artifact) => artifact.path !== requiredClarifyArtifacts[2]),
  }));
  fs.writeFileSync(clarifyReviewPath, JSON.stringify({
    ...clarifyReview,
    reviewedArtifacts: clarifyArtifacts.filter((artifact) => artifact.path !== requiredClarifyArtifacts[2]),
  }));
  const missingClassificationBinding = auditWorkflow(root, changeId, state);
  assert.equal(missingClassificationBinding.stages.find((stage) => stage.stage === 'clarify').status, 'block');
  fs.writeFileSync(v2ResultPath(root, changeId, clarifyExecute.runId), JSON.stringify(clarifyResult));
  fs.writeFileSync(clarifyReviewPath, JSON.stringify(clarifyReview));

  const missing = auditWorkflow(root, changeId, state);
  const missingDesign = missing.stages.find((stage) => stage.stage === 'design');
  const expectedResultGates = {
    clarify: 'clarify',
    design: 'design',
    plan: 'plan',
    implement: 'implement',
    verify: 'verify',
    archive: 'archive',
  };
  assert.deepEqual(
    Object.fromEntries(missing.stages.map((stage) => [stage.stage, stage.resultGate ?? null])),
    expectedResultGates,
    'v6 audit must expose every Heavy-Skill structured result gate',
  );
  assert.equal(missing.verdict, 'block');
  assert.equal(missingDesign.status, 'block');
  assert.ok(missingDesign.results.some((result) => result.status === 'block'));

  const tecpc = {
    target: 'audit design result',
    evidence: [designRef],
    context: [requirementsRef],
    path: designRef,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  const stageResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify(stageResult));
  const check = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    tecpc,
  });
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    rubricIds: ['design'],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-14T00:00:01.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, check.runId, 'check'), JSON.stringify(review));
  appendCompletedHandoffBinding(root, changeId, execute.input, { agentId: 'agent-design' });
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: 'agent-design-review' });

  const complete = auditWorkflow(root, changeId, state);
  const completeDesign = complete.stages.find((stage) => stage.stage === 'design');
  assert.equal(complete.verdict, 'pass');
  assert.equal(completeDesign.status, 'pass');
  assert.deepEqual(completeDesign.results.map((result) => result.status), ['pass']);

  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n\n## Task 1: task-one\n');
  const includingCurrent = auditWorkflow(root, changeId, state, { includeCurrent: true });
  const currentPlan = includingCurrent.stages.find((stage) => stage.stage === 'plan');
  assert.equal(includingCurrent.verdict, 'block');
  assert.equal(currentPlan.status, 'block');
  assert.deepEqual(currentPlan.results.map((result) => result.status), ['block']);

  console.log(`PASS workflow-audit-v6-result ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
