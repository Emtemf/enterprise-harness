import crypto from 'node:crypto';
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

// ── 静态阶段链：由 CLI `validate` 在阶段边界显式调用，验证通过后落 stage-gate marker ──
// 这些检查只依赖已批准的 clarify/route/design/plan 证据，写代码过程中不会变化，
// 所以不应每次 Write/Edit 都重跑（那是 pre-write 的旧行为，浪费且职责重叠）。
export function validateStageChain(root, changeId, state) {
  const problems = [];
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
  const events = readAgentEvents(root, changeId);
  if (!events.some((item) => item.kind === 'codegraph-attempt'
      && item.agentId
      && item.observedAgentType === 'enterprise-harness:code-explore')) {
    problems.push('no agent-bound CodeGraph attempt exists');
  }
  return problems;
}

// ── 动态瞬间 gate：pre-write hook 每次写受治理路径都查 ──
// 这些依赖当前 tool event 的 agent 归属与当前 task 的 RED，属于"写这个文件本身"的前置，
// 无法推迟到阶段边界，必须当场强制。
export function validateDynamicWriteGates(root, changeId, state, target, event = {}) {
  const problems = [];
  if (!isGovernedTarget(root, target)) return problems;
  const agentId = String(event.agent_id || '').trim();
  if (!agentId || !boundHarnessAgent(root, changeId, agentId, 'enterprise-harness:tdd-executor')) {
    problems.push('tool event is not bound to an active enterprise-harness:tdd-executor');
  }
  const events = readAgentEvents(root, changeId);
  if (requiredGateForTarget(root, target)?.needsRedVerified) {
    problems.push(...validateTaskRedReceipt(root, changeId, state, agentId));
  } else if (!String(state?.currentTask || '').trim()) {
    // 测试路径写入天然免 RED（RED 就是靠写测试产生的），但仍必须归属到某个 task，
    // 否则 currentTask 检查只存在于 RED 分支，测试代码可以完全脱离 plan 写入。
    problems.push('currentTask is missing');
  }
  return problems;
}

// ── stage-gate marker ──
// 只对静态阶段链证据计算 digest：requirements/change/design/tasks + reviews/*。
// 刻意排除 state.json（含 currentTask/gates.redVerified 等 tdd 动态字段）、evidence/*
// （含 tdd receipts）、validation.md（verify 阶段才写）——否则 tdd 中途写 evidence
// 会让 marker 失效，把后续写代码误 block。
const STAGE_GATE_FILES = ['requirements.md', 'change.md', 'design.md', 'tasks.md'];

export function computeStageGateDigest(root, changeId) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  if (!fs.existsSync(changeDir)) return null;
  const hash = crypto.createHash('sha256');
  for (const rel of STAGE_GATE_FILES) {
    const full = path.join(changeDir, rel);
    if (fs.existsSync(full)) {
      hash.update(rel);
      hash.update('\n');
      hash.update(fs.readFileSync(full, 'utf-8'));
      hash.update('\n');
    }
  }
  const reviewsDir = path.join(changeDir, 'reviews');
  if (fs.existsSync(reviewsDir)) {
    for (const name of fs.readdirSync(reviewsDir).sort()) {
      const full = path.join(reviewsDir, name);
      if (!fs.statSync(full).isFile()) continue;
      hash.update(`reviews/${name}`);
      hash.update('\n');
      hash.update(fs.readFileSync(full, 'utf-8'));
      hash.update('\n');
    }
  }
  return hash.digest('hex');
}

export function stageGateMarkerPath(root, changeId) {
  return path.join(root, 'harness', 'changes', changeId, 'evidence', 'stage-gate.json');
}

export function loadStageGateMarker(root, changeId) {
  const file = stageGateMarkerPath(root, changeId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

// hook 的轻量检查：marker 存在、标记 ok、digest 匹配当前静态证据、stage 匹配。
// 不重算任何阶段链；重算是 CLI `validate` 的职责。
export function stageGateIsFresh(root, changeId, state) {
  const marker = loadStageGateMarker(root, changeId);
  if (!marker || marker.ok !== true) return { fresh: false, reason: 'missing-or-invalid-marker' };
  const expectedStage = state?.workflow?.stage;
  if (expectedStage && marker.stage !== expectedStage) {
    return { fresh: false, reason: `stage-mismatch (marker=${marker.stage}, current=${expectedStage})` };
  }
  const digest = computeStageGateDigest(root, changeId);
  if (!digest || marker.changeDigest !== digest) {
    return { fresh: false, reason: 'stage-evidence-digest-mismatch' };
  }
  return { fresh: true, marker };
}
