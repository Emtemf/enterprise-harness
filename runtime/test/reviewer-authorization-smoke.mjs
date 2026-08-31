import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { validateStageGate } from '../lib/stage-results.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-reviewer-authorization-'));
const changeId = 'reviewer-authorization';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;
const taskCommandsRef = `harness/changes/${changeId}/task-commands.json`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;

function appendCompletedBinding(input, agentId, observedAgentType, sessionId = 'session-review') {
  const toolUseId = `tool-${input.runId}-${agentId}`;
  appendAgentEvent(root, changeId, {
    kind: 'dispatch',
    sessionId,
    toolUseId,
    requestedAgentType: observedAgentType,
    runId: input.runId,
    behavior: input.behavior,
    handoffRole: input.role,
    parentRunId: input.parentRunId,
    handoffPath: v2ResultPath(root, changeId, input.runId, input.role),
    cwd: root,
  });
  appendAgentEvent(root, changeId, {
    kind: 'start',
    sessionId,
    agentId,
    observedAgentType,
    runId: input.runId,
    handoffRole: input.role,
    cwd: root,
  });
  appendAgentEvent(root, changeId, {
    kind: 'stop',
    sessionId,
    agentId,
    observedAgentType,
    runId: input.runId,
    handoffRole: input.role,
    parentRunId: input.parentRunId,
    cwd: root,
  });
  appendAgentEvent(root, changeId, {
    kind: 'dispatch-binding',
    sessionId,
    toolUseId,
    agentId,
    requestedAgentType: observedAgentType,
    runId: input.runId,
    behavior: input.behavior,
    handoffRole: input.role,
    parentRunId: input.parentRunId,
    cwd: root,
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.dirname(path.join(root, requirementsRef)), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- Independent review\n');
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks', '', '## Task 1: task-one', '### Target and scope', '- Goal: authorize review',
    '### Frozen inputs', '- Consumes: design.md', '- Test cases: TC1', '### Execution strategy', '- Strategy: `direct`',
    '### Commands and verification', '- Frozen primary argv: `node --test fixture.mjs`', '- Acceptance checks: fixture passes', '- Recovery/rollback: revert fixture',
    '### Independent review', '- Applicable rubrics: task',
  ].join('\n'));
  fs.writeFileSync(path.join(root, taskCommandsRef), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      'task-one': {
        executionStrategy: 'direct',
        strategyRationale: 'Fixture verification is sufficient.',
        testCases: ['TC1'],
        minimalRedCase: null,
        writeScope: { allowed: ['fixture.mjs'], forbidden: [] },
        commands: [{ phase: 'VERIFY', argv: ['node', '--test', 'fixture.mjs'] }],
      },
    },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, testCasesRef), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable | cleanup | accepted |',
  ].join('\n'));
  fs.mkdirSync(path.dirname(path.join(root, designProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, designProofRef), JSON.stringify({ type: 'completion-proof', stage: 'design' }));
  writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'plan' });

  const tecpc = {
    target: 'authorize independent plan review',
    evidence: [tasksRef],
    context: [requirementsRef, testCasesRef, designProofRef],
    path: tasksRef,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [requirementsRef, testCasesRef, designProofRef],
    tecpc,
  });
  const artifacts = [tasksRef, taskCommandsRef].map((reference) => ({
    path: reference,
    digest: sha256Artifact(root, reference),
  }));
  const stageResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'plan',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts,
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [tasksRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [tasksRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-16T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify(stageResult));

  const check = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [tasksRef, taskCommandsRef],
    tecpc,
  });
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'plan',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: artifacts,
    rubricIds: [...check.input.rubricIds],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-16T00:00:01.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, check.runId, 'check'), JSON.stringify(review));

  const forged = validateStageGate(root, changeId, 'plan', { requiredArtifactPath: tasksRef });
  assert.match(forged.join('; '), /trusted.*agent binding|authorized.*reviewer/u);

  appendCompletedBinding(execute.input, 'agent-shared', 'enterprise-harness:artifact-worker');
  appendCompletedBinding(check.input, 'agent-shared', 'enterprise-harness:reviewer');
  const selfApproved = validateStageGate(root, changeId, 'plan', { requiredArtifactPath: tasksRef });
  assert.match(selfApproved.join('; '), /distinct.*agent|same agent/u);

  appendCompletedBinding(check.input, 'agent-reviewer', 'enterprise-harness:reviewer');
  assert.match(
    validateStageGate(root, changeId, 'plan', { requiredArtifactPath: tasksRef }).join('; '),
    /CompletionProof is missing/u,
    'independent review alone must not satisfy a read-only stage gate',
  );
  const proof = buildCompletionProof(root, {
    stageResult,
    reviewResult: review,
    createdAt: '2026-08-16T00:00:02.000Z',
  });
  const proofPath = path.join(root, 'harness', 'changes', changeId, 'evidence', 'completion', 'plan.json');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  assert.deepEqual(
    validateStageGate(root, changeId, 'plan', { requiredArtifactPath: tasksRef }),
    [],
  );

  console.log(`PASS reviewer-authorization ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
