import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendDecisionEvent } from '../core/decision-ledger.mjs';
import { stageCompletionFor, validateStageGate } from '../lib/stage-results.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lifecycle = path.join(sourceRoot, 'runtime', 'lifecycle.mjs');
const workflow = path.join(sourceRoot, 'runtime', 'workflow.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-lifecycle-clarify-gate-'));
const changeId = 'clarify-transition';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const {
  ENTERPRISE_HARNESS_SESSION_ID: _enterpriseHarnessSessionId,
  CLAUDE_SESSION_ID: _claudeSessionId,
  ...unboundEnv
} = process.env;

function advance() {
  return spawnSync(process.execPath, [lifecycle, 'state', changeId, 'design'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: unboundEnv,
  });
}

function confirmScopeShortcut() {
  return spawnSync(process.execPath, [workflow, 'decide', changeId, 'confirm-scope', 'scope already confirmed'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: unboundEnv,
  });
}

function workflowStatus() {
  return spawnSync(process.execPath, [workflow, 'status', changeId, '--json'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: unboundEnv,
  });
}

function controllerRoutesFromWorkflowStatus(status) {
  const route = { research: 'R', decisions: 'D', completion: 'C', transition: 'T' }[
    status.clarifyReadiness.route
  ];
  return route ? [route] : [];
}

function assertCompletionRecovery(label) {
  const status = workflowStatus();
  assert.equal(status.status, 0, status.stderr);
  const projection = JSON.parse(status.stdout);
  assert.equal(projection.clarifyReadiness.transitionReady, false, label);
  assert.notEqual(projection.clarifyReadiness.recovery, null, label);
  assert.notEqual(projection.clarifyReadiness.recovery.code, 'EH-CLARIFY-PROOF-143', label);
  assert.deepEqual(controllerRoutesFromWorkflowStatus(projection), ['C'], label);
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), approvedRequirements());
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    decision: { tier: 'L1' },
  });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);

  const requiredClarifyArtifacts = [
    requirementsRef,
    classification.path,
    `harness/changes/${changeId}/debt-assessment.json`,
    `harness/changes/${changeId}/project-contract-assessment.json`,
    `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`,
  ];
  const clarifyAssertionIds = [
    'research-complete',
    'decisions-durable',
    'technical-debt-disposed',
    'project-contract-disposed',
    'requirements-ready',
    'classification-ready',
    'scope-confirmed',
  ];
  const tecpc = {
    target: 'confirm all canonical Clarify artifacts',
    evidence: [...requiredClarifyArtifacts],
    context: [...requiredClarifyArtifacts],
    path: requiredClarifyArtifacts.join(' -> '),
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.confirmed',
    agent: { type: 'enterprise-harness:main', skill: 'harness' },
    inputRefs: requiredClarifyArtifacts,
    tecpc,
  });
  const completeArtifacts = requiredClarifyArtifacts
    .map((artifactPath) => ({ path: artifactPath, digest: sha256Artifact(root, artifactPath) }));
  const incompleteArtifacts = completeArtifacts.filter((artifact) => artifact.path !== requiredClarifyArtifacts[2]);
  const stageResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'clarify',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:main', skill: 'harness' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts: incompleteArtifacts,
    assertions: clarifyAssertionIds.map((id, index) => ({
      id,
      verdict: 'pass',
      evidence: [[requirementsRef], [requiredClarifyArtifacts[4]], [requiredClarifyArtifacts[2]],
        [requiredClarifyArtifacts[3]], [requirementsRef], [classification.path], [requiredClarifyArtifacts[4]]][index],
    })),
    selfCheck: { verdict: 'pass', findings: [], evidence: [...requiredClarifyArtifacts] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-16T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify(stageResult));

  const check = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: requiredClarifyArtifacts,
    tecpc,
  });
  const reviewPath = v2ResultPath(root, changeId, check.runId, 'check');
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'clarify',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: incompleteArtifacts,
    rubricIds: [...check.input.rubricIds],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-16T00:00:01.000Z',
  };
  fs.writeFileSync(reviewPath, JSON.stringify(review));
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: 'enterprise-harness:main' });

  const missingBinding = advance();
  assert.equal(missingBinding.status, 2, missingBinding.stderr || missingBinding.stdout);
  assert.match(`${missingBinding.stdout}\n${missingBinding.stderr}`, /does not bind.*debt-assessment\.json|Clarify artifacts must exactly bind/u);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'clarify');
  assertCompletionRecovery('missing required artifact binding must remain on C');

  const staleArtifacts = completeArtifacts.map((artifact) => ({ ...artifact }));
  staleArtifacts[0].digest = 'f'.repeat(64);
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify({
    ...stageResult,
    artifacts: staleArtifacts,
  }));
  fs.writeFileSync(reviewPath, JSON.stringify({ ...review, reviewedArtifacts: staleArtifacts }));
  const staleDigest = advance();
  assert.equal(staleDigest.status, 2, 'stale Clarify artifact digest must block Design');
  assert.match(`${staleDigest.stdout}\n${staleDigest.stderr}`, /artifact digest is stale/u);
  assertCompletionRecovery('stale required artifact digest must remain on C');

  const missingSelfCheck = { ...stageResult, artifacts: completeArtifacts };
  delete missingSelfCheck.selfCheck;
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify(missingSelfCheck));
  fs.writeFileSync(reviewPath, JSON.stringify({ ...review, reviewedArtifacts: completeArtifacts }));
  const noSelfCheck = advance();
  assert.equal(noSelfCheck.status, 2, 'missing Clarify self-check must block Design');
  assert.match(`${noSelfCheck.stdout}\n${noSelfCheck.stderr}`, /selfCheck is required/u);
  assertCompletionRecovery('missing StageResult self-check must remain on C');

  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify({
    ...stageResult,
    artifacts: completeArtifacts,
  }));
  const reusedReviewer = advance();
  assert.equal(reusedReviewer.status, 2, 'reviewer reusing the producer identity must block Design');
  assert.match(`${reusedReviewer.stdout}\n${reusedReviewer.stderr}`, /distinct agent identities/u);
  assertCompletionRecovery('missing independent review must remain on C');

  const independentCheck = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: requiredClarifyArtifacts,
    tecpc,
  });
  const independentInput = JSON.parse(fs.readFileSync(independentCheck.path, 'utf-8'));
  independentInput.createdAt = '2099-08-25T00:00:00.000Z';
  fs.writeFileSync(independentCheck.path, `${JSON.stringify(independentInput, null, 2)}\n`);
  const independentReviewPath = v2ResultPath(root, changeId, independentCheck.runId, 'check');
  const independentReview = {
    ...review,
    runId: independentCheck.runId,
    rubricIds: [...independentCheck.input.rubricIds],
    reviewedArtifacts: completeArtifacts,
  };
  fs.writeFileSync(independentReviewPath, JSON.stringify(independentReview));
  appendCompletedHandoffBinding(root, changeId, independentInput, { agentId: 'agent-clarify-review' });

  const debtRef = requiredClarifyArtifacts[2];
  const originalDebt = fs.readFileSync(path.join(root, debtRef), 'utf-8');
  const changedDebt = JSON.parse(originalDebt);
  changedDebt.updatedAt = '2026-08-25T00:01:01.000Z';
  fs.writeFileSync(path.join(root, debtRef), `${JSON.stringify(changedDebt, null, 2)}\n`);
  const changedDebtDigest = sha256Artifact(root, debtRef);
  const changedArtifacts = completeArtifacts.map((artifact) => (
    artifact.path === debtRef ? { ...artifact, digest: changedDebtDigest } : artifact
  ));
  const changedExecuteInput = JSON.parse(fs.readFileSync(execute.path, 'utf-8'));
  changedExecuteInput.inputDigests[debtRef] = changedDebtDigest;
  fs.writeFileSync(execute.path, `${JSON.stringify(changedExecuteInput, null, 2)}\n`);
  const changedIndependentInput = JSON.parse(fs.readFileSync(independentCheck.path, 'utf-8'));
  changedIndependentInput.inputDigests[debtRef] = changedDebtDigest;
  fs.writeFileSync(independentCheck.path, `${JSON.stringify(changedIndependentInput, null, 2)}\n`);
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify({
    ...stageResult,
    inputDigests: { ...changedExecuteInput.inputDigests },
    artifacts: changedArtifacts,
    selfCheck: { ...stageResult.selfCheck, evidence: [...requiredClarifyArtifacts] },
  }));
  fs.writeFileSync(independentReviewPath, JSON.stringify({
    ...independentReview,
    reviewedArtifacts: changedArtifacts,
  }));
  assert.notEqual(
    stageCompletionFor(root, changeId, 'clarify').selfCheck.status,
    'pass',
    'canonical completion must reject a classification that no longer binds a current semantic artifact',
  );

  fs.writeFileSync(path.join(root, debtRef), originalDebt);
  fs.writeFileSync(execute.path, `${JSON.stringify(execute.input, null, 2)}\n`);
  fs.writeFileSync(independentCheck.path, `${JSON.stringify(independentInput, null, 2)}\n`);
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify({ ...stageResult, artifacts: completeArtifacts }));
  fs.writeFileSync(independentReviewPath, JSON.stringify(independentReview));

  const pendingTecpc = { ...tecpc, correction: 'Reconcile the Clarify evidence.' };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify({
    ...stageResult,
    artifacts: completeArtifacts,
    tecpc: pendingTecpc,
  }));
  fs.writeFileSync(independentReviewPath, JSON.stringify({ ...independentReview, tecpc: pendingTecpc }));
  const incompleteTecpc = advance();
  assert.equal(incompleteTecpc.status, 2, 'incomplete Clarify TECPC must block Design');
  assert.match(`${incompleteTecpc.stdout}\n${incompleteTecpc.stderr}`, /Clarify TECPC requires correction=null|TECPC correction remains pending/u);
  const statusWithIncompleteTecpc = workflowStatus();
  assert.equal(statusWithIncompleteTecpc.status, 0, statusWithIncompleteTecpc.stderr);
  const incompleteProjection = JSON.parse(statusWithIncompleteTecpc.stdout);
  assert.deepEqual(controllerRoutesFromWorkflowStatus(incompleteProjection), ['C'],
    'a real status with one missing candidate-proof prerequisite must remain on C');
  assert.match(incompleteProjection.clarifyReadiness.recovery.code, /^EH-CLARIFY-(?:SELF-CHECK-140|TECPC-142)$/u);
  assert.notEqual(incompleteProjection.clarifyReadiness.recovery.code, 'EH-CLARIFY-PROOF-143');

  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify({ ...stageResult, artifacts: completeArtifacts }));
  fs.writeFileSync(independentReviewPath, JSON.stringify(independentReview));
  const proofPath = path.join(changeDir, 'evidence', 'completion', 'clarify.json');
  const preexistingProof = buildCompletionProof(root, {
    stageResult: { ...stageResult, artifacts: completeArtifacts },
    reviewResult: independentReview,
    producerAgentIds: ['enterprise-harness:main'],
    reviewerAgentIds: ['agent-clarify-review'],
    createdAt: '2026-08-25T00:02:00.000Z',
  });
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, `${JSON.stringify(preexistingProof, null, 2)}\n`);
  const shortcut = confirmScopeShortcut();
  assert.equal(shortcut.status, 2, 'workflow confirm-scope must not be a second Clarify transition path');
  assert.match(`${shortcut.stdout}\n${shortcut.stderr}`, /EH-WORKFLOW-STAGE-GATE-007.*lifecycle/u);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'clarify');

  fs.rmSync(proofPath);
  assert.match(
    validateStageGate(root, changeId, 'clarify').join('; '),
    /CompletionProof is missing/u,
    'read-only gate validation must require the persisted exact proof',
  );
  assert.equal(fs.existsSync(proofPath), false, 'read-only gate validation must not publish the candidate proof');
  const statusWithoutProof = workflowStatus();
  assert.equal(statusWithoutProof.status, 0, statusWithoutProof.stderr);
  const proofFreeProjection = JSON.parse(statusWithoutProof.stdout);
  assert.equal(proofFreeProjection.clarifyReadiness.status, 'ready');
  assert.equal(proofFreeProjection.clarifyReadiness.transitionReady, true);
  assert.equal(proofFreeProjection.clarifyReadiness.recovery, null,
    'missing persisted proof is transition-owned output state, not status-first recovery');
  assert.equal(proofFreeProjection.pendingDecision, null,
    'v6 Clarify status must not revive the legacy confirm-scope shortcut');
  assert.equal(proofFreeProjection.nextAction, proofFreeProjection.nextEntry,
    'the current /harness entry is not a pre-entry recovery action');
  assert.deepEqual(controllerRoutesFromWorkflowStatus(proofFreeProjection), ['T'],
    'real proof-free status with all prerequisites fresh must select T');
  assert.equal(fs.existsSync(proofPath), false, 'workflow status must remain read-only');

  const transitionLock = path.join(changeDir, '.change-transaction.lock');
  fs.mkdirSync(transitionLock);
  const concurrentAdvance = advance();
  assert.equal(concurrentAdvance.status, 2, 'a concurrent change-level transition must fail closed');
  assert.match(`${concurrentAdvance.stdout}\n${concurrentAdvance.stderr}`, /EH-STATE-LOCK-012/u);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'clarify');
  fs.rmSync(transitionLock, { recursive: true, force: true });

  const outsideCompletion = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-proof-outside-'));
  const completionDir = path.dirname(proofPath);
  fs.rmSync(completionDir, { recursive: true, force: true });
  fs.symlinkSync(outsideCompletion, completionDir, 'dir');
  const symlinkedAdvance = advance();
  assert.equal(symlinkedAdvance.status, 2, 'nested completion symlink must block the transition-owned write');
  assert.match(`${symlinkedAdvance.stdout}\n${symlinkedAdvance.stderr}`, /EH-PATH-001.*(?:symbolic-link component|escapes its parent)/u);
  assert.equal(fs.existsSync(path.join(outsideCompletion, 'clarify.json')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'clarify');
  fs.rmSync(completionDir);
  fs.rmSync(outsideCompletion, { recursive: true, force: true });

  const advanced = advance();
  assert.equal(advanced.status, 0, advanced.stderr || advanced.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'design');

  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
  assert.deepEqual(proof.reviewedArtifacts, completeArtifacts);
  assert.deepEqual(proof.decisionSnapshotRef, completeArtifacts[4]);
  assert.deepEqual(proof.assertions, stageResult.assertions);
  assert.deepEqual(proof.tecpc, tecpc);
  assert.equal(stageCompletionFor(root, changeId, 'clarify').proof.status, 'pass');

  fs.writeFileSync(proofPath, `${JSON.stringify({
    ...proof,
    artifacts: proof.artifacts.map((artifact, index) => index === 0 ? { ...artifact, digest: 'e'.repeat(64) } : artifact),
  }, null, 2)}\n`);
  assert.equal(stageCompletionFor(root, changeId, 'clarify').proof.status, 'stale');
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);

  assert.throws(() => appendDecisionEvent(root, changeId, {
    eventVersion: 1,
    type: 'decision-event',
    eventId: 'later-design-note',
    changeId,
    stage: 'clarify',
    actor: { type: 'user', id: 'test-user' },
    decisionType: 'scope-confirmation',
    targetRef: `${requirementsRef}#sha256=${sha256Artifact(root, requirementsRef)}`,
    questionId: 'later-design-question',
    options: ['confirm', 'revise'],
    recommendedOption: 'confirm',
    selectedOption: 'confirm',
    publicRationale: 'A later ledger suffix must not mutate the sealed Clarify prefix.',
    evidenceRefs: [requirementsRef],
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    recordedAt: '2026-08-25T00:03:00.000Z',
  }), /EH-DECISION-TARGET-106/u,
  'a later decision may not silently contradict or duplicate a resolved typed target');
  assert.equal(
    stageCompletionFor(root, changeId, 'clarify').proof.status,
    'pass',
    'a rejected duplicate decision must not stale the immutable Clarify proof',
  );

  console.log(`PASS lifecycle-clarify-transition ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
