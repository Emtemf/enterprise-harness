import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditWorkflow } from '../lib/workflow-audit.mjs';
import { buildCompoundDesignProof, buildDesignArchitectureProof } from '../core/design-proof.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const workflow = fileURLToPath(new URL('../workflow.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-workflow-audit-v6-'));
const changeId = 'audit-design';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const architectureProofRef = `harness/changes/${changeId}/evidence/completion/design-architecture.json`;
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

function runAuditCommand() {
  return spawnSync(process.execPath, [workflow, 'audit', changeId, '--json'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
}

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
  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n\n## TC1\n');

  const classificationRef = state.artifacts.classification.path;
  const requiredClarifyArtifacts = [
    requirementsRef,
    classificationRef,
    `harness/changes/${changeId}/debt-assessment.json`,
    `harness/changes/${changeId}/project-contract-assessment.json`,
    `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`,
  ];
  const researchRefs = Object.keys(JSON.parse(fs.readFileSync(path.join(root, classificationRef), 'utf-8')).inputDigests)
    .filter((ref) => ref.includes('/runs/') && ref.endsWith('/result.json'));
  const frozenClarifyRefs = [...requiredClarifyArtifacts, ...researchRefs];
  const clarifyTecpc = {
    target: 'confirm canonical Clarify artifacts',
    evidence: frozenClarifyRefs,
    context: frozenClarifyRefs,
    path: frozenClarifyRefs.join(' -> '),
    correction: null,
  };
  const clarifyExecute = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.confirmed',
    agent: { type: 'enterprise-harness:main', skill: 'harness' },
    inputRefs: frozenClarifyRefs,
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
      ['research-complete', [requirementsRef, ...researchRefs]],
      ['decisions-durable', requiredClarifyArtifacts[4]],
      ['technical-debt-disposed', requiredClarifyArtifacts[2]],
      ['project-contract-disposed', requiredClarifyArtifacts[3]],
      ['requirements-ready', requirementsRef],
      ['classification-ready', classificationRef],
      ['scope-confirmed', requiredClarifyArtifacts[4]],
    ].map(([id, reference]) => ({ id, verdict: 'pass', evidence: Array.isArray(reference) ? reference : [reference] })),
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
    inputRefs: frozenClarifyRefs,
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

  const clarifyProofPath = path.join(changeDir, 'evidence', 'completion', 'clarify.json');
  const missingClarifyProof = auditWorkflow(root, changeId, state);
  const missingClarifyStage = missingClarifyProof.stages.find((stage) => stage.stage === 'clarify');
  assert.equal(missingClarifyStage.status, 'block', 'read-only audit must block without a persisted Clarify proof');
  assert.match(
    missingClarifyStage.blockers.map(({ message }) => message).join('\n'),
    /Clarify.*CompletionProof is missing|clarify CompletionProof is missing/u,
  );
  assert.equal(fs.existsSync(clarifyProofPath), false, 'read-only audit must not publish a candidate proof');
  const missingClarifyProofCommand = runAuditCommand();
  assert.equal(missingClarifyProofCommand.status, 2, 'workflow audit command must block without a persisted Clarify proof');
  assert.equal(fs.existsSync(clarifyProofPath), false, 'workflow audit command must remain read-only');

  const clarifyProof = buildCompletionProof(root, {
    stageResult: clarifyResult,
    reviewResult: clarifyReview,
    producerAgentIds: ['enterprise-harness:main'],
    reviewerAgentIds: ['agent-clarify-review'],
    createdAt: '2026-08-13T00:00:02.000Z',
  });
  fs.mkdirSync(path.dirname(clarifyProofPath), { recursive: true });
  fs.writeFileSync(clarifyProofPath, `${JSON.stringify(clarifyProof, null, 2)}\n`);

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

  const architectureTecpc = {
    target: 'audit architecture design result',
    evidence: [designRef],
    context: [requirementsRef],
    path: designRef,
    correction: null,
  };
  const architectureExecute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc: architectureTecpc,
  });
  const architectureResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: architectureExecute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { ...architectureExecute.input.inputDigests },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc: architectureTecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, architectureExecute.runId), JSON.stringify(architectureResult));
  const architectureCheck = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.review',
    role: 'check',
    parentRunId: architectureExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    tecpc: architectureTecpc,
  });
  const architectureReview = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: architectureCheck.runId,
    parentRunId: architectureExecute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: architectureExecute.runId,
    reviewedArtifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    rubricIds: [...architectureCheck.input.rubricIds],
    tecpc: architectureTecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-14T00:00:01.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), JSON.stringify(architectureReview));
  appendCompletedHandoffBinding(root, changeId, architectureExecute.input, { agentId: 'agent-design' });
  appendCompletedHandoffBinding(root, changeId, architectureCheck.input, { agentId: 'agent-design-review' });

  const architectureProof = buildDesignArchitectureProof(root, architectureResult, architectureReview);
  fs.mkdirSync(path.dirname(path.join(root, architectureProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, architectureProofRef), `${JSON.stringify(architectureProof, null, 2)}\n`);

  const designProofPath = path.join(changeDir, 'evidence', 'completion', 'design.json');
  const architectureOnly = auditWorkflow(root, changeId, state);
  const architectureOnlyStage = architectureOnly.stages.find((stage) => stage.stage === 'design');
  assert.equal(architectureOnlyStage.status, 'block', 'architecture-only audit must block Design');
  assert.deepEqual(
    architectureOnlyStage.handoffs.map(({ behavior, status }) => [behavior, status]),
    [['design.produce', 'pass'], ['design.test-cases', 'block']],
    'audit must expose both required Design behavior chains',
  );
  assert.equal(fs.existsSync(designProofPath), false, 'read-only audit must not publish a Design candidate proof');

  const testDesignTecpc = {
    target: 'audit detailed test design result',
    evidence: [testCasesRef],
    context: [requirementsRef, designRef, architectureProofRef],
    path: `${architectureProofRef} -> ${testCasesRef}`,
    correction: null,
  };
  const testDesignExecute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [requirementsRef, designRef, architectureProofRef],
    tecpc: testDesignTecpc,
  });
  const testDesignResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: testDesignExecute.runId,
    producer: { agentType: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputDigests: { ...testDesignExecute.input.inputDigests },
    artifacts: [{ path: testCasesRef, digest: sha256Artifact(root, testCasesRef) }],
    assertions: [{ id: 'test-design-contract', verdict: 'pass', evidence: [testCasesRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [testCasesRef] },
    tecpc: testDesignTecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:02.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, testDesignExecute.runId), JSON.stringify(testDesignResult));
  const testDesignCheck = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases.review',
    role: 'check',
    parentRunId: testDesignExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [testCasesRef],
    tecpc: testDesignTecpc,
  });
  const testDesignReview = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: testDesignCheck.runId,
    parentRunId: testDesignExecute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: testDesignExecute.runId,
    reviewedArtifacts: [{ path: testCasesRef, digest: sha256Artifact(root, testCasesRef) }],
    rubricIds: [...testDesignCheck.input.rubricIds],
    tecpc: testDesignTecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-14T00:00:03.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), JSON.stringify(testDesignReview));
  appendCompletedHandoffBinding(root, changeId, testDesignExecute.input, { agentId: 'agent-test-design' });
  appendCompletedHandoffBinding(root, changeId, testDesignCheck.input, { agentId: 'agent-test-design-review' });

  const missingDesignProof = auditWorkflow(root, changeId, state);
  const missingDesignProofStage = missingDesignProof.stages.find((stage) => stage.stage === 'design');
  assert.equal(missingDesignProofStage.status, 'block', 'read-only audit must block without a persisted compound Design proof');
  assert.deepEqual(missingDesignProofStage.handoffs.map(({ status }) => status), ['pass', 'pass']);
  assert.match(missingDesignProofStage.blockers.map(({ message }) => message).join('\n'), /design CompletionProof is missing/u);
  assert.equal(fs.existsSync(designProofPath), false, 'read-only audit must remain non-publishing');

  const designProof = buildCompoundDesignProof(root, architectureProof, testDesignResult, testDesignReview);
  fs.mkdirSync(path.dirname(designProofPath), { recursive: true });
  fs.writeFileSync(designProofPath, `${JSON.stringify({
    ...designProof,
    artifacts: designProof.artifacts.map((artifact, index) => (
      index === 0 ? { ...artifact, digest: 'f'.repeat(64) } : artifact
    )),
  }, null, 2)}\n`);
  const staleDesignProof = auditWorkflow(root, changeId, state);
  assert.equal(
    staleDesignProof.stages.find((stage) => stage.stage === 'design').status,
    'block',
    'read-only audit must block a stale persisted proof',
  );
  assert.equal(runAuditCommand().status, 2, 'workflow audit command must block a stale persisted proof');

  fs.writeFileSync(designProofPath, `${JSON.stringify({ ...designProof, target: 'mismatched target' }, null, 2)}\n`);
  const mismatchedDesignProof = auditWorkflow(root, changeId, state);
  assert.equal(
    mismatchedDesignProof.stages.find((stage) => stage.stage === 'design').status,
    'block',
    'read-only audit must block a mismatched persisted proof',
  );
  assert.equal(runAuditCommand().status, 2, 'workflow audit command must block a mismatched persisted proof');

  fs.writeFileSync(designProofPath, `${JSON.stringify(designProof, null, 2)}\n`);
  const complete = auditWorkflow(root, changeId, state);
  const completeDesign = complete.stages.find((stage) => stage.stage === 'design');
  assert.equal(complete.verdict, 'pass');
  assert.equal(completeDesign.status, 'pass');
  assert.deepEqual(completeDesign.results.map((result) => result.status), ['pass']);
  assert.deepEqual(
    completeDesign.handoffs.map(({ behavior, status }) => [behavior, status]),
    [['design.produce', 'pass'], ['design.test-cases', 'pass']],
  );
  assert.equal(runAuditCommand().status, 0, 'workflow audit command must accept exact persisted proofs');

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
