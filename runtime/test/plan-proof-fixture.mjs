import fs from 'node:fs';
import path from 'node:path';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { resolveStageCompletionCandidate } from '../lib/stage-results.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeCanonicalSingleTaskPlanFixture(root, changeId, {
  taskId,
  tasksContent,
  taskCommands,
} = {}) {
  const base = `harness/changes/${changeId}`;
  const changeDir = path.join(root, base);
  const design = writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'plan' });
  const tasksRef = `${base}/tasks.md`;
  const commandsRef = `${base}/task-commands.json`;
  fs.writeFileSync(path.join(root, tasksRef), tasksContent);
  writeJson(path.join(root, commandsRef), taskCommands);
  const tecpc = {
    target: `冻结单任务 ${taskId} 的可执行计划`,
    evidence: [design.designProofRef, design.testCasesRef],
    context: [design.requirementsRef, design.designRef],
    path: `${design.designProofRef} -> ${tasksRef} + ${commandsRef}`,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [design.requirementsRef, design.designRef, design.testCasesRef, design.designProofRef],
    tecpc,
  });
  const artifacts = [tasksRef, commandsRef].map((artifactPath) => ({
    path: artifactPath,
    digest: sha256Artifact(root, artifactPath),
  }));
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'plan',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts,
    assertions: [{ id: 'single-task-plan-fixture', verdict: 'pass', evidence: [tasksRef, commandsRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [tasksRef, commandsRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  writeJson(v2ResultPath(root, changeId, execute.runId), result);
  const check = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [design.requirementsRef, design.designRef, design.testCasesRef, design.designProofRef, tasksRef, commandsRef],
    rubricIds: ['plan'],
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
    rubricIds: ['plan'],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: new Date().toISOString(),
  };
  writeJson(v2ResultPath(root, changeId, check.runId, 'check'), review);
  appendCompletedHandoffBinding(root, changeId, execute.input, { agentId: 'fixture-plan-executor' });
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: 'fixture-plan-reviewer' });
  const completion = resolveStageCompletionCandidate(root, changeId, 'plan');
  if (!completion.proof) throw new Error(`single-task Plan fixture is invalid: ${completion.problems.join('; ')}`);
  const proofRef = `${base}/evidence/completion/plan.json`;
  writeJson(path.join(root, proofRef), completion.proof);
  const statePath = path.join(changeDir, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  writeJson(statePath, { ...state, revision: (state.revision || 0) + 1, stage: 'implement', currentTask: taskId });
  return { ...design, tasksRef, commandsRef, planProofRef: proofRef, execute, check };
}
