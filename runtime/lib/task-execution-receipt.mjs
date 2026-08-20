import fs from 'node:fs';
import path from 'node:path';
import {
  frozenTaskExecutionCommands,
  loadTaskExecutionStrategy,
  TASK_EXECUTION_PHASES,
} from './task-execution.mjs';
import { gitCommonDir } from './agent-evidence.mjs';
import { sha256Artifact } from './result-contract.mjs';
import { assertSafeId, assertSafeRunId, resolveChild } from './safe-paths.mjs';

const RECEIPT_FIELDS = new Set([
  'receiptVersion',
  'provenance',
  'changeId',
  'taskId',
  'executionStrategy',
  'strategyRationale',
  'agent',
  'worktree',
  'changedPaths',
  'outputSnapshot',
  'inputDigests',
  'executions',
  'completedAt',
]);

const EXECUTION_FIELDS = new Set([
  'phase',
  'argv',
  'outcome',
  'exitCode',
  'signal',
  'spawnError',
  'startedAt',
  'finishedAt',
  'stdoutDigest',
  'stderrDigest',
]);

const DIGEST = /^[a-f0-9]{64}$/u;
const GIT_ID = /^[0-9a-f]{40,64}$/u;

export function taskExecutionReceiptPath(root, changeId, taskId) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const evidenceDir = resolveChild(changeDir, 'evidence', 'evidence');
  const tasksDir = resolveChild(evidenceDir, 'tasks', 'task receipts');
  return path.join(tasksDir, `${taskId}.json`);
}

export function taskExecutionReceiptSpoolPath(root, changeId, taskId, runId) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  assertSafeRunId(runId, 'runId');
  const receiptRoot = path.join(gitCommonDir(root), 'enterprise-harness', 'receipts');
  const changeRoot = resolveChild(receiptRoot, changeId, 'changeId');
  const tasksRoot = resolveChild(changeRoot, 'tasks', 'task receipt spool');
  const taskRoot = resolveChild(tasksRoot, taskId, 'taskId');
  return path.join(taskRoot, `${runId}.json`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateDigestMap(inputDigests, problems, label = 'inputDigests') {
  if (!isObject(inputDigests) || Object.keys(inputDigests).length === 0) {
    problems.push(`${label} must be a non-empty object`);
    return;
  }
  for (const [ref, digest] of Object.entries(inputDigests)) {
    if (!ref.trim()) problems.push(`${label} contains an empty artifact reference`);
    if (!DIGEST.test(String(digest))) problems.push(`${label}.${ref} must be a sha256 digest`);
  }
}

function validateAgent(agent, problems) {
  if (!isObject(agent)) {
    problems.push('agent must be an object');
    return;
  }
  if (!String(agent.id || '').trim()) problems.push('agent.id is required');
  if (agent.type !== 'enterprise-harness:implementer') {
    problems.push('agent.type must be enterprise-harness:implementer');
  }
}

function validateWorktree(worktree, problems) {
  if (!isObject(worktree)) {
    problems.push('worktree must be an object');
    return;
  }
  if (!pathIsAbsolute(worktree.path)) problems.push('worktree.path must be absolute');
  if (!pathIsAbsolute(worktree.gitCommonDir)) problems.push('worktree.gitCommonDir must be absolute');
  if (!GIT_ID.test(String(worktree.headBefore || ''))) problems.push('worktree.headBefore must be a git id');
  if (!GIT_ID.test(String(worktree.headAfter || ''))) problems.push('worktree.headAfter must be a git id');
  if (!DIGEST.test(String(worktree.treeDigestBefore || ''))) problems.push('worktree.treeDigestBefore must be sha256');
  if (!DIGEST.test(String(worktree.treeDigestAfter || ''))) problems.push('worktree.treeDigestAfter must be sha256');
}

function pathIsAbsolute(value) {
  return typeof value === 'string' && value.length > 0
    && (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value));
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value)) return false;
  return !value.split(/[\\/]/u).some((part) => part === '..' || part === '');
}

export function captureTaskOutputSnapshot(root, changedPaths) {
  return Object.fromEntries([...changedPaths].sort().map((relative) => {
    if (!isSafeRelativePath(relative)) throw new Error(`unsafe changed path: ${relative}`);
    const target = path.resolve(root, relative);
    if (!fs.existsSync(target)) return [relative, { state: 'deleted' }];
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error(`changed path is a symlink: ${relative}`);
    if (!stat.isFile()) throw new Error(`changed path is not a regular file: ${relative}`);
    return [relative, { state: 'file', digest: sha256Artifact(root, relative) }];
  }));
}

function validateOutputSnapshot(snapshot, changedPaths, problems) {
  if (snapshot === undefined) return;
  if (!isObject(snapshot)) {
    problems.push('outputSnapshot must be an object');
    return;
  }
  const snapshotPaths = Object.keys(snapshot).sort();
  const expectedPaths = [...changedPaths].sort();
  if (!sameJson(snapshotPaths, expectedPaths)) {
    problems.push('outputSnapshot paths must exactly match changedPaths');
  }
  for (const [relative, entry] of Object.entries(snapshot)) {
    if (!isSafeRelativePath(relative) || !isObject(entry)) {
      problems.push('outputSnapshot must contain safe path entries');
      continue;
    }
    for (const field of Object.keys(entry)) {
      if (!['state', 'digest'].includes(field)) problems.push(`outputSnapshot.${relative} has unknown property ${field}`);
    }
    if (!['file', 'deleted'].includes(entry.state)) problems.push(`outputSnapshot.${relative}.state is invalid`);
    if (entry.state === 'file' && !DIGEST.test(String(entry.digest || ''))) {
      problems.push(`outputSnapshot.${relative}.digest must be sha256`);
    }
    if (entry.state === 'deleted' && Object.hasOwn(entry, 'digest')) {
      problems.push(`outputSnapshot.${relative} deletion must not carry a digest`);
    }
  }
}

function validateExecutions(
  executions,
  requiredPhases,
  strategy,
  problems,
  expectedCommands = null,
  { allowIncomplete = false } = {},
) {
  if (!Array.isArray(executions) || executions.length === 0) {
    problems.push('executions must be a non-empty array');
    return;
  }
  if ((!allowIncomplete && executions.length !== requiredPhases.length)
    || (allowIncomplete && executions.length > requiredPhases.length)) {
    problems.push(`${strategy} requires ${allowIncomplete ? 'at most' : 'exactly'} ${requiredPhases.length} executions`);
  }
  const phases = [];
  let previousFinished = -Infinity;
  for (const [index, execution] of executions.entries()) {
    if (!isObject(execution)) {
      problems.push(`executions[${index}] must be an object`);
      continue;
    }
    for (const field of Object.keys(execution)) {
      if (!EXECUTION_FIELDS.has(field)) {
        problems.push(`executions[${index}] has unknown property ${field}`);
      }
    }
    const phase = String(execution.phase || '').toUpperCase();
    phases.push(phase);
    if (!requiredPhases.includes(phase)) problems.push(`${strategy} contains an unknown execution phase`);
    if (requiredPhases[index] && phase !== requiredPhases[index]) {
      problems.push(`${strategy} execution ${index + 1} must be phase ${requiredPhases[index]}`);
    }
    if (!Array.isArray(execution.argv) || execution.argv.length === 0
      || execution.argv.some((argument) => typeof argument !== 'string' || argument.length === 0)) {
      problems.push(`executions[${index}].argv must be a non-empty string array`);
    }
    if (!['exit', 'signal', 'spawn-error'].includes(execution.outcome)) {
      problems.push(`executions[${index}].outcome is invalid`);
    }
    if (execution.outcome === 'exit') {
      if (!Number.isInteger(execution.exitCode)) {
        problems.push(`executions[${index}].exitCode must be an integer`);
      }
      if (execution.signal !== null) problems.push(`executions[${index}].signal must be null for an exit outcome`);
      if (execution.spawnError !== null) problems.push(`executions[${index}].spawnError must be null for an exit outcome`);
    } else if (execution.outcome === 'signal') {
      if (execution.exitCode !== null) problems.push(`executions[${index}].exitCode must be null for a signal outcome`);
      if (!String(execution.signal || '').trim()) problems.push(`executions[${index}].signal is required`);
      if (execution.spawnError !== null) problems.push(`executions[${index}].spawnError must be null for a signal outcome`);
      problems.push(`${phase || `execution ${index + 1}`} was terminated by a signal`);
    } else if (execution.outcome === 'spawn-error') {
      if (execution.exitCode !== null) problems.push(`executions[${index}].exitCode must be null for a spawn-error outcome`);
      if (execution.signal !== null) problems.push(`executions[${index}].signal must be null for a spawn-error outcome`);
      if (!String(execution.spawnError || '').trim()) problems.push(`executions[${index}].spawnError is required`);
      problems.push(`${phase || `execution ${index + 1}`} failed to spawn`);
    }
    const started = Date.parse(execution.startedAt);
    const finished = Date.parse(execution.finishedAt);
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
      problems.push(`executions[${index}] timestamps are invalid`);
    } else if (started < previousFinished) {
      problems.push(`executions[${index}] starts before the previous phase finished`);
    } else {
      previousFinished = finished;
    }
    if (!DIGEST.test(String(execution.stdoutDigest || ''))
      || !DIGEST.test(String(execution.stderrDigest || ''))) {
      problems.push(`executions[${index}] output digests must be sha256`);
    }
    if (expectedCommands?.[index]
      && !sameJson(execution.argv, expectedCommands[index].argv)) {
      problems.push(`${phase || `execution ${index + 1}`} argv differs from the frozen task command`);
    }
  }
  if (new Set(phases).size !== phases.length) problems.push(`${strategy} execution phases must be unique`);
  if (!allowIncomplete && requiredPhases.some((phase) => !phases.includes(phase))) {
    problems.push(`${strategy} requires phases ${requiredPhases.join(', ')}`);
  }
  const redExecution = executions.find((execution) => execution?.phase === 'RED');
  if (strategy === 'tdd' && redExecution
    && (redExecution.outcome !== 'exit' || redExecution.exitCode === 0)) {
    problems.push('RED execution must be a real nonzero process exit');
  }
  const reproduceExecution = executions.find((execution) => execution?.phase === 'REPRODUCE');
  if (strategy === 'regression' && reproduceExecution
    && (reproduceExecution.outcome !== 'exit' || reproduceExecution.exitCode === 0)) {
    problems.push('REPRODUCE execution must be a real nonzero process exit');
  }
  for (const phase of requiredPhases) {
    if (phase === 'RED' || phase === 'REPRODUCE') continue;
    const execution = executions.find((item) => item?.phase === phase);
    if (execution && (execution.outcome !== 'exit' || execution.exitCode !== 0)) {
      problems.push(`${phase} execution must pass with a real zero process exit`);
    }
  }
}

function validateFrozenTask(root, receipt, problems, { allowIncomplete = false } = {}) {
  try {
    const plan = loadTaskExecutionStrategy(root, receipt.changeId, receipt.taskId);
    if (!plan.ok) {
      problems.push(...plan.problems.map((problem) => `frozen task: ${problem}`));
      return;
    }
    if (receipt.executionStrategy !== plan.strategy) {
      problems.push(`executionStrategy does not match frozen task strategy ${plan.strategy}`);
      return;
    }
    if (plan.strategy === 'direct'
      && receipt.strategyRationale !== plan.task.strategyRationale) {
      problems.push('strategyRationale does not match the frozen task rationale');
    }
    const expected = frozenTaskExecutionCommands(plan.task, plan.strategy);
    if (expected.length !== TASK_EXECUTION_PHASES[plan.strategy].length
      || expected.some((command) => !Array.isArray(command.argv) || command.argv.length === 0)) {
      problems.push('frozen task commands are incomplete');
      return;
    }
    validateExecutions(
      receipt.executions,
      TASK_EXECUTION_PHASES[plan.strategy],
      plan.strategy,
      problems,
      expected,
      { allowIncomplete },
    );
  } catch (error) {
    problems.push(`frozen task validation failed: ${error.message}`);
  }
}

export function validateTaskExecutionReceipt(
  receipt,
  {
    expectedChangeId = null,
    expectedTaskId = null,
    expectedInputDigests = null,
    expectedStrategy = null,
    expectedAgent = null,
    root = null,
    requireTrusted = false,
    allowIncomplete = false,
  } = {},
) {
  const problems = [];
  if (!isObject(receipt)) return ['task execution receipt must be an object'];
  for (const field of Object.keys(receipt)) {
    if (!RECEIPT_FIELDS.has(field)) problems.push(`task execution receipt has unknown property ${field}`);
  }
  if (receipt.receiptVersion !== 2) problems.push('receiptVersion must be 2');
  if (!String(receipt.changeId || '').trim()) problems.push('changeId is required');
  if (!String(receipt.taskId || '').trim()) problems.push('taskId is required');
  if (expectedChangeId && receipt.changeId !== expectedChangeId) problems.push(`changeId must be ${expectedChangeId}`);
  if (expectedTaskId && receipt.taskId !== expectedTaskId) problems.push(`taskId must be ${expectedTaskId}`);
  if (!TASK_EXECUTION_PHASES[receipt.executionStrategy]) problems.push(`invalid executionStrategy ${receipt.executionStrategy || 'missing'}`);
  if (expectedStrategy && receipt.executionStrategy !== expectedStrategy) problems.push(`executionStrategy must be ${expectedStrategy}`);
  if (receipt.executionStrategy === 'direct' && !String(receipt.strategyRationale || '').trim()) {
    problems.push('strategyRationale is required for direct execution');
  }
  validateAgent(receipt.agent, problems);
  if (expectedAgent && receipt.agent?.id !== expectedAgent) problems.push('agent id does not match the bound executor');
  validateWorktree(receipt.worktree, problems);
  if (!Array.isArray(receipt.changedPaths) || receipt.changedPaths.some((value) => !isSafeRelativePath(value))) {
    problems.push('changedPaths must contain safe relative paths');
  } else {
    validateOutputSnapshot(receipt.outputSnapshot, receipt.changedPaths, problems);
  }
  validateDigestMap(receipt.inputDigests, problems);
  if (expectedInputDigests && !sameJson(
    Object.entries(receipt.inputDigests || {}).sort(),
    Object.entries(expectedInputDigests).sort(),
  )) {
    problems.push('receipt input digests do not exactly match the execute handoff');
  }
  if (TASK_EXECUTION_PHASES[receipt.executionStrategy]) {
    validateExecutions(
      receipt.executions,
      TASK_EXECUTION_PHASES[receipt.executionStrategy],
      receipt.executionStrategy,
      problems,
      null,
      { allowIncomplete },
    );
  }
  if (allowIncomplete) {
    const requiredCount = TASK_EXECUTION_PHASES[receipt.executionStrategy]?.length || Infinity;
    const isComplete = Array.isArray(receipt.executions)
      && receipt.executions.length === requiredCount;
    if (isComplete && !Number.isFinite(Date.parse(receipt.completedAt))) {
      problems.push('completedAt must be an ISO timestamp for a complete receipt');
    }
    if (!isComplete && receipt.completedAt !== undefined) {
      problems.push('completedAt is forbidden for an incomplete receipt');
    }
  } else if (!Number.isFinite(Date.parse(receipt.completedAt))) {
    problems.push('completedAt must be an ISO timestamp');
  }
  if (requireTrusted && receipt.provenance !== 'runtime-runner') {
    problems.push('trusted receipt provenance must be runtime-runner');
  }
  if (requireTrusted && !isObject(receipt.outputSnapshot)) {
    problems.push('trusted receipt outputSnapshot is required');
  }
  if (requireTrusted && !root) problems.push('trusted receipt validation requires repository root');
  if (root && receipt.changeId && receipt.taskId) {
    validateFrozenTask(root, receipt, problems, { allowIncomplete });
  }
  return [...new Set(problems)];
}

export function readTaskExecutionReceipt(
  root,
  changeId,
  taskId,
  options = {},
) {
  const file = taskExecutionReceiptPath(root, changeId, taskId);
  if (!fs.existsSync(file)) {
    return { ok: false, path: file, receipt: null, problems: ['execution receipt is missing'] };
  }
  try {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const problems = validateTaskExecutionReceipt(receipt, {
      ...options,
      root,
      expectedChangeId: changeId,
      expectedTaskId: taskId,
    });
    if (options.requireFreshInputs) {
      for (const ref of receipt.inputRefs || Object.keys(receipt.inputDigests || {})) {
        try {
          if (sha256Artifact(root, ref) !== receipt.inputDigests?.[ref]) {
            problems.push(`task input digest is stale: ${ref}`);
          }
        } catch (error) {
          problems.push(`task input is unreadable: ${ref} (${error.message})`);
        }
      }
    }
    return { ok: problems.length === 0, path: file, receipt, problems: [...new Set(problems)] };
  } catch (error) {
    return { ok: false, path: file, receipt: null, problems: [`execution receipt is unreadable: ${error.message}`] };
  }
}

export { TASK_EXECUTION_PHASES };
