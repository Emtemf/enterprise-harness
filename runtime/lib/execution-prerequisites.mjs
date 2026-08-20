import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateAmbiguityGate } from './ambiguity.mjs';
import { validateRouterScore } from './router-score.mjs';
import { boundHarnessAgent, gitCommonDir, readAgentEvents } from './agent-evidence.mjs';
import { evidenceModeForChange } from './evidence-policy.mjs';
import { isGovernedTarget, requiredGateForTarget } from './gates.mjs';
import { readAndValidateTddReceipt, tddReceiptSpoolPath } from './tdd-receipts.mjs';
import { readClassificationArtifact } from '../core/classification-artifact.mjs';
import {
  loadTaskExecutionStrategy,
} from './task-execution.mjs';
import {
  readTaskExecutionReceipt,
} from './task-execution-receipt.mjs';
import { validateStageGate } from './stage-results.mjs';

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

export function validateTaskExecutionEvidence(root, changeId, state, agentId) {
  const taskId = String(state?.currentTask || '').trim();
  if (!taskId) return ['currentTask is missing'];
  const resolved = loadTaskExecutionStrategy(root, changeId, taskId, state?.executionStrategy);
  if (!resolved.ok) return resolved.problems;
  const receipt = readTaskExecutionReceipt(root, changeId, taskId, {
    expectedStrategy: resolved.strategy,
    expectedAgent: agentId || null,
    requireTrusted: true,
    requireFreshInputs: true,
  });
  if (!receipt.ok) return receipt.problems.map((problem) => `${resolved.strategy} receipt: ${problem}`);
  if (agentId && receipt.receipt.agent?.id !== agentId) return ['execution receipt agent does not match tool event agent_id'];
  return [];
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
// v6 消费 classification、StageResult、独立 ReviewResult 与 fresh digest；v5 compatibility
// 才读取旧 ambiguity/router/review projection。写代码时 pre-write 只检查 marker freshness。
export function validateStageChain(root, changeId, state) {
  const problems = [];
  const policy = evidenceModeForChange(root, changeId);
  if (!policy.ok) problems.push(`sealed evidence policy unavailable: ${policy.problems.join('; ')}`);
  const changeDir = path.join(root, 'harness', 'changes', changeId);

  // v6 stage-gate: artifact presence + independent review, not persisted booleans.
  // v5 compat: still check the old gates if the state uses them.
  const isV6 = state?.schemaVersion === 6;

  if (!fs.existsSync(path.join(changeDir, 'requirements.md'))) problems.push('missing requirements.md');

  if (isV6) {
    // v6: classification is an internal artifact, not a direct state field.
    const reference = state?.artifacts?.classification;
    if (!reference) {
      problems.push('classification artifact reference is missing (internal durable action)');
    } else {
      try {
        readClassificationArtifact(root, changeId, reference);
      } catch (error) {
        problems.push(`classification artifact is invalid: ${error.message}`);
      }
    }
  } else {
    // v5 compat: check the old gate fields
    if (!state?.workflow?.userConfirmedScope || !state?.workflow?.clarifyReady) problems.push('clarify scope is not confirmed');
    problems.push(...validateAmbiguityGate(root, changeId, state));
    if (!['L0', 'L1', 'L2', 'L3'].includes(state?.tier)) problems.push('tier is missing');
    problems.push(...validateRouterScore(root, changeId, state));
  }

  if (isV6) {
    const designRef = `harness/changes/${changeId}/design.md`;
    const tasksRef = `harness/changes/${changeId}/tasks.md`;
    problems.push(...validateStageGate(root, changeId, 'design', {
      requiredArtifactPath: designRef,
    }).map((problem) => `design gate: ${problem}`));
    problems.push(...validateStageGate(root, changeId, 'plan', {
      requiredArtifactPath: tasksRef,
    }).map((problem) => `plan gate: ${problem}`));
  } else {
    if (!fs.existsSync(path.join(changeDir, 'design.md'))) problems.push('missing design.md');
    const designReviewNames = ['design.json', 'design-reviewer.json'];
    const foundDesignName = designReviewNames.find((name) => (
      fs.existsSync(path.join(changeDir, 'reviews', name))
    ));
    if (foundDesignName) readReview(changeDir, foundDesignName, problems);
    else problems.push('missing reviews/design.json');
    if (state?.gates?.designApproved !== true) problems.push('gates.designApproved is not true');

    const tasksPath = path.join(changeDir, 'tasks.md');
    if (!fs.existsSync(tasksPath) || !fs.readFileSync(tasksPath, 'utf-8').startsWith('# Tasks')) {
      problems.push('tasks.md is not finalized');
    }
    const planReviewNames = ['plan.json', 'plan-critic.json'];
    const foundPlanName = planReviewNames.find((name) => (
      fs.existsSync(path.join(changeDir, 'reviews', name))
    ));
    if (foundPlanName) readReview(changeDir, foundPlanName, problems);
    else problems.push('missing reviews/plan.json');
    if (state?.workflow?.planReady !== true) problems.push('workflow.planReady is not true');
  }

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
  const policyRoot = event.subjectRoot || root;
  const agentId = String(event.agent_id || '').trim();
  const isAuthorized = agentId && (
    boundHarnessAgent(root, changeId, agentId, 'enterprise-harness:implementer')
    || (state?.schemaVersion !== 6
      && boundHarnessAgent(root, changeId, agentId, 'enterprise-harness:tdd-executor'))
  );
  if (!isAuthorized) {
    problems.push('tool event is not bound to an active enterprise-harness:implementer');
  }
  const events = readAgentEvents(root, changeId);
  if (state?.schemaVersion === 6) {
    if (event.tool_name !== 'Bash') {
      problems.push('v6 受治理路径只能由 canonical task-run 的冻结子进程写入');
    }
    if (!String(state?.currentTask || '').trim()) problems.push('currentTask is missing');
    else {
      const task = loadTaskExecutionStrategy(policyRoot, changeId, state.currentTask, state?.executionStrategy);
      if (!task.ok) problems.push(...task.problems);
    }
  } else if (requiredGateForTarget(root, target)?.needsRedVerified) {
    problems.push(...validateTaskRedReceipt(root, changeId, state, agentId));
  } else if (!String(state?.currentTask || '').trim()) {
    // 测试路径写入天然免 RED（RED 就是靠写测试产生的），但仍必须归属到某个 task，
    // 否则 currentTask 检查只存在于 RED 分支，测试代码可以完全脱离 plan 写入。
    problems.push('currentTask is missing');
  }
  return problems;
}

// ── stage-gate marker ──
// digest 绑定静态 artifact、state 的阶段证据子集、v6 Design/Plan Handoff v2 结果、
// agent-bound CodeGraph attempt 和 v5 compatibility reviews。刻意排除 currentTask、Implement run、
// task receipt 与 validation.md，避免合法 task 派发或执行过程使 prerequisite marker 自失效。
const STAGE_GATE_FILES = [
  'requirements.md',
  'change.md',
  'classification.json',
  'design.md',
  'tasks.md',
];
const STRUCTURED_GATE_STAGES = new Set(['design', 'plan']);

function updateHashWithFile(hash, label, file) {
  hash.update(label);
  hash.update('\n');
  hash.update(fs.readFileSync(file));
  hash.update('\n');
}

function updateHashWithStateEvidence(hash, changeDir) {
  const statePath = path.join(changeDir, 'state.json');
  if (!fs.existsSync(statePath)) return;
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const evidence = state.schemaVersion === 6
      ? {
        schemaVersion: state.schemaVersion,
        changeId: state.changeId,
        stage: state.stage,
        classification: state.artifacts?.classification || null,
      }
      : {
        schemaVersion: state.schemaVersion || null,
        tier: state.tier || null,
        workflow: {
          userConfirmedScope: state.workflow?.userConfirmedScope === true,
          clarifyReady: state.workflow?.clarifyReady === true,
          planReady: state.workflow?.planReady === true,
        },
        designApproved: state.gates?.designApproved === true,
      };
    hash.update('state-evidence\n');
    hash.update(JSON.stringify(evidence));
    hash.update('\n');
  } catch {
    updateHashWithFile(hash, 'state.json', statePath);
  }
}

function updateHashWithStructuredRuns(hash, root, changeId) {
  const runsDir = path.join(gitCommonDir(root), 'enterprise-harness', 'runs', changeId);
  if (!fs.existsSync(runsDir)) return;
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const runDir = path.join(runsDir, entry.name);
    const inputPath = path.join(runDir, 'input.json');
    if (!fs.existsSync(inputPath)) continue;
    let input;
    try {
      input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    } catch {
      updateHashWithFile(hash, `runs/${entry.name}/input.json`, inputPath);
      continue;
    }
    if (!STRUCTURED_GATE_STAGES.has(input.stage)) continue;
    for (const fileEntry of fs.readdirSync(runDir, { withFileTypes: true })
      .filter((item) => item.isFile())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      updateHashWithFile(
        hash,
        `runs/${entry.name}/${fileEntry.name}`,
        path.join(runDir, fileEntry.name),
      );
    }
  }
}

function updateHashWithCodeGraphEvidence(hash, root, changeId) {
  const attempts = readAgentEvents(root, changeId)
    .filter((event) => event.kind === 'codegraph-attempt'
      && event.agentId
      && event.observedAgentType === 'enterprise-harness:code-explore');
  hash.update('codegraph-attempts\n');
  hash.update(JSON.stringify(attempts));
  hash.update('\n');
}

export function computeStageGateDigest(root, changeId) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  if (!fs.existsSync(changeDir)) return null;
  const hash = crypto.createHash('sha256');
  for (const rel of STAGE_GATE_FILES) {
    const full = path.join(changeDir, rel);
    if (fs.existsSync(full)) updateHashWithFile(hash, rel, full);
  }
  updateHashWithStateEvidence(hash, changeDir);
  const reviewsDir = path.join(changeDir, 'reviews');
  if (fs.existsSync(reviewsDir)) {
    for (const entry of fs.readdirSync(reviewsDir, { withFileTypes: true })
      .filter((item) => item.isFile())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      updateHashWithFile(hash, `reviews/${entry.name}`, path.join(reviewsDir, entry.name));
    }
  }
  updateHashWithStructuredRuns(hash, root, changeId);
  updateHashWithCodeGraphEvidence(hash, root, changeId);
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
  const expectedStage = state?.stage;
  if (expectedStage && marker.stage !== expectedStage) {
    return { fresh: false, reason: `stage-mismatch (marker=${marker.stage}, current=${expectedStage})` };
  }
  const digest = computeStageGateDigest(root, changeId);
  if (!digest || marker.changeDigest !== digest) {
    return { fresh: false, reason: 'stage-evidence-digest-mismatch' };
  }
  return { fresh: true, marker };
}
