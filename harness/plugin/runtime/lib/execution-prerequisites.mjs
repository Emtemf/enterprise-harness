import fs from 'node:fs';
import path from 'node:path';
import { validateAmbiguityGate } from './ambiguity.mjs';
import { validateRouterScore } from './router-score.mjs';
import { boundHarnessAgent, readAgentEvents } from './agent-evidence.mjs';
import { evidenceModeForChange } from './evidence-policy.mjs';
import { isGovernedTarget, requiredGateForTarget } from './gates.mjs';
import { readAndValidateTddReceipt, tddReceiptSpoolPath } from './tdd-receipts.mjs';

function readReview(changeDir, name, problems) {
  const file = path.join(changeDir, 'reviews', name);
  if (!fs.existsSync(file)) {
    problems.push(`missing reviews/${name}`);
    return null;
  }
  try {
    const review = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!['pass', 'advisory'].includes(review.verdict)) problems.push(`reviews/${name} is not non-blocking`);
    return review;
  } catch {
    problems.push(`reviews/${name} is invalid JSON`);
    return null;
  }
}

export function validateTaskRedReceipt(root, changeId, state, agentId) {
  const taskId = String(state?.currentTask || '').trim();
  if (!taskId) return ['currentTask is missing'];
  const loaded = readAndValidateTddReceipt(tddReceiptSpoolPath(root, changeId, taskId), {
    root,
    changeId,
    taskId,
    allowBootstrap: taskId === 'task-1',
    requireComplete: false,
  });
  if (!loaded.ok) return loaded.problems.map((problem) => `RED receipt: ${problem}`);
  const executions = loaded.receipt.executions || [];
  if (executions.length < 1 || executions[0].phase !== 'RED' || executions[0].exitCode === 0) {
    return ['RED receipt does not contain a failing RED phase'];
  }
  if (agentId && loaded.receipt.agent?.id !== agentId) return ['RED receipt agent does not match tool event agent_id'];
  return [];
}

export function validateExecutionPrerequisites(root, changeId, state, target, event = {}) {
  const problems = [];
  if (!isGovernedTarget(root, target)) return problems;
  const policy = evidenceModeForChange(root, changeId);
  if (!policy.ok) problems.push(`sealed evidence policy unavailable: ${policy.problems.join('; ')}`);
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  if (!fs.existsSync(path.join(changeDir, 'requirements.md'))) problems.push('missing requirements.md');
  if (!state?.workflow?.userConfirmedScope || !state?.workflow?.clarifyReady) problems.push('clarify scope is not confirmed');
  problems.push(...validateAmbiguityGate(root, changeId, state));
  if (!['L0', 'L1', 'L2', 'L3'].includes(state?.tier)) problems.push('tier is missing');
  problems.push(...validateRouterScore(root, changeId, state));
  if (!fs.existsSync(path.join(changeDir, 'design.md'))) problems.push('missing design.md');
  readReview(changeDir, 'design-reviewer.json', problems);
  if (state?.gates?.designApproved !== true) problems.push('gates.designApproved is not true');
  const tasksPath = path.join(changeDir, 'tasks.md');
  if (!fs.existsSync(tasksPath) || !fs.readFileSync(tasksPath, 'utf-8').startsWith('# Tasks')) problems.push('tasks.md is not finalized');
  readReview(changeDir, 'plan-critic.json', problems);
  if (state?.workflow?.planReady !== true) problems.push('workflow.planReady is not true');

  const agentId = String(event.agent_id || '').trim();
  if (!agentId || !boundHarnessAgent(root, changeId, agentId, 'enterprise-harness:tdd-executor')) {
    problems.push('tool event is not bound to an active enterprise-harness:tdd-executor');
  }
  const events = readAgentEvents(root, changeId);
  if (!events.some((item) => item.kind === 'codegraph-attempt'
      && item.agentId
      && item.observedAgentType === 'enterprise-harness:code-explore')) {
    problems.push('no agent-bound CodeGraph attempt exists');
  }
  if (requiredGateForTarget(root, target)?.needsRedVerified) {
    problems.push(...validateTaskRedReceipt(root, changeId, state, agentId));
  }
  return problems;
}
