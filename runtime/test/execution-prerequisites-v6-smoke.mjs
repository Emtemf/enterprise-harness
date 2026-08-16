import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { writeClassificationArtifact } from '../core/classification-artifact.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { createEvidencePolicy } from '../lib/evidence-policy.mjs';
import {
  computeStageGateDigest,
  loadStageGateMarker,
  stageGateIsFresh,
  validateStageChain,
} from '../lib/execution-prerequisites.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-v6-stage-chain-'));
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const validateCli = path.join(sourceRoot, 'runtime', 'validate.mjs');
const changeId = 'v6-stage-chain';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const stateRef = `harness/changes/${changeId}/state.json`;
const designRef = `harness/changes/${changeId}/design.md`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function writeResult(runId, role, value) {
  const target = v2ResultPath(root, changeId, runId, role);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function addReviewedStage(stage, skill, inputRefs, artifactRef) {
  const tecpc = {
    target: `complete ${stage}`,
    evidence: [artifactRef],
    context: [...inputRefs],
    path: `${inputRefs.join(' -> ')} -> ${artifactRef}`,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage,
    behavior: `${stage}.produce`,
    agent: { type: 'enterprise-harness:artifact-worker', skill },
    inputRefs,
    tecpc,
  });
  const artifacts = [{ path: artifactRef, digest: sha256Artifact(root, artifactRef) }];
  const stageResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage,
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill },
    inputDigests: { ...execute.input.inputDigests },
    artifacts,
    assertions: [{ id: `${stage}-contract`, verdict: 'pass', evidence: [artifactRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [artifactRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-16T00:00:01.000Z',
  };
  writeResult(execute.runId, 'execute', stageResult);

  const check = createHandoffV2(root, {
    changeId,
    stage,
    behavior: `${stage}.review`,
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [artifactRef],
    tecpc,
  });
  const checkResultPath = v2ResultPath(root, changeId, check.runId, 'check');
  writeResult(check.runId, 'check', {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage,
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: artifacts,
    rubricIds: [...check.input.rubricIds],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-16T00:00:02.000Z',
  });
  appendCompletedHandoffBinding(root, changeId, execute.input, {
    agentId: `${stage}-executor`,
  });
  appendCompletedHandoffBinding(root, changeId, check.input, {
    agentId: `${stage}-reviewer`,
  });
  return { execute, check, checkResultPath };
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  git(['init', '-q']);
  git(['config', 'user.email', 'stage-chain@example.test']);
  git(['config', 'user.name', 'Stage Chain Fixture']);
  fs.writeFileSync(path.join(root, '.gitignore'), '.fixture\n');
  git(['add', '.gitignore']);
  git(['commit', '-qm', 'fixture baseline']);
  createEvidencePolicy(root, { strictChangeIds: [changeId] });

  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');
  fs.writeFileSync(path.join(root, tasksRef), '# Tasks\n\n## Task 1: task-one\n');
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
  });
  const state = {
    schemaVersion: 6,
    changeId,
    stage: 'implement',
    currentTask: 'task-one',
    artifacts: { classification },
    gates: { designApproved: false },
    workflow: { planReady: false },
  };
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  appendAgentEvent(root, changeId, {
    kind: 'codegraph-attempt',
    agentId: 'explorer-1',
    observedAgentType: 'enterprise-harness:code-explore',
    cwd: root,
  });
  addReviewedStage('design', 'design', [requirementsRef], designRef);
  const plan = addReviewedStage('plan', 'plan', [designRef], tasksRef);

  const valid = validateStageChain(root, changeId, state);
  assert.deepEqual(valid, [], `structured v6 stage proofs must pass without review projections: ${valid.join('; ')}`);

  const validation = spawnSync(process.execPath, [validateCli, changeId], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: { ...process.env, ENTERPRISE_HARNESS_SESSION_ID: '', CLAUDE_SESSION_ID: '' },
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  assert.equal(loadStageGateMarker(root, changeId)?.stage, 'implement');
  assert.equal(stageGateIsFresh(root, changeId, state).fresh, true);

  const digestBeforeImplementDispatch = computeStageGateDigest(root, changeId);
  createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.task',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [stateRef, tasksRef],
    tecpc: {
      target: 'execute task-one',
      evidence: [],
      context: [tasksRef],
      path: tasksRef,
      correction: null,
    },
  });
  assert.equal(
    computeStageGateDigest(root, changeId),
    digestBeforeImplementDispatch,
    'creating the current implement run must not invalidate its prerequisite marker',
  );

  const digestBeforeReviewMutation = computeStageGateDigest(root, changeId);
  const review = JSON.parse(fs.readFileSync(plan.checkResultPath, 'utf-8'));
  fs.writeFileSync(plan.checkResultPath, `${JSON.stringify({
    ...review,
    verdict: 'block',
    correction: 'plan review was revoked',
  }, null, 2)}\n`);
  const digestAfterReviewMutation = computeStageGateDigest(root, changeId);
  assert.notEqual(
    digestAfterReviewMutation,
    digestBeforeReviewMutation,
    'stage-gate digest must bind common-dir Handoff v2 inputs and structured results',
  );
  fs.writeFileSync(plan.checkResultPath, `${JSON.stringify(review, null, 2)}\n`);

  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'reviews', 'design.json'), JSON.stringify({ verdict: 'pass' }));
  fs.writeFileSync(path.join(changeDir, 'reviews', 'plan.json'), JSON.stringify({ verdict: 'pass' }));
  fs.appendFileSync(path.join(root, designRef), '\nstale after review\n');
  const stale = validateStageChain(root, changeId, {
    ...state,
    gates: { designApproved: true },
    workflow: { planReady: true },
  });
  assert.ok(
    stale.some((problem) => /stale|digest|StageResult|ReviewResult/u.test(problem)),
    `legacy projection files must not hide stale v6 structured results: ${stale.join('; ')}`,
  );

  console.log(`PASS execution-prerequisites-v6 ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
