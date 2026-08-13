import fs from 'node:fs';
import path from 'node:path';
import { assertSafeId, resolveChild } from './safe-paths.mjs';

export const TASK_EXECUTION_STRATEGIES = new Set([
  'tdd',
  'regression',
  'characterization',
  'direct',
  'migration',
  'generation',
]);

const REQUIRED_PHASES = Object.freeze({
  tdd: ['RED'],
  regression: ['REPRODUCE'],
  characterization: ['BASELINE'],
  direct: [],
  migration: ['DRY_RUN'],
  generation: ['GENERATE'],
});

function taskCommandsPath(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return path.join(resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId'), 'task-commands.json');
}

export function executionReceiptPath(root, changeId, taskId) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  return path.join(resolveChild(path.join(root, 'harness', 'changes', changeId, 'evidence'), 'execution', 'evidence'), `${taskId}.json`);
}

export function loadTaskExecutionStrategy(root, changeId, taskId, fallback = null) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  const file = taskCommandsPath(root, changeId);
  if (!fs.existsSync(file)) return { ok: false, strategy: null, problems: ['task command freeze is missing'] };
  try {
    const frozen = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const task = frozen?.tasks?.[taskId];
    if (!task) return { ok: false, strategy: null, problems: [`task is not frozen: ${taskId}`] };
    const strategy = task.executionStrategy ?? fallback ?? 'tdd';
    if (!TASK_EXECUTION_STRATEGIES.has(strategy)) {
      return { ok: false, strategy: null, problems: [`executionStrategy is invalid: ${strategy}`] };
    }
    return { ok: true, strategy, task, problems: [] };
  } catch (error) {
    return { ok: false, strategy: null, problems: [`task command freeze is unreadable: ${error.message}`] };
  }
}

export function validateTaskExecutionReceipt(receipt, { changeId, taskId, strategy, requireComplete = false } = {}) {
  const problems = [];
  if (!receipt || typeof receipt !== 'object') return ['execution receipt is not an object'];
  if (receipt.receiptVersion !== 1) problems.push('receiptVersion must be 1');
  if (receipt.provenance !== 'task-execution') problems.push('provenance must be task-execution');
  if (receipt.changeId !== changeId) problems.push('changeId mismatch');
  if (receipt.taskId !== taskId) problems.push('taskId mismatch');
  if (receipt.strategy !== strategy) problems.push('strategy mismatch');
  if (!String(receipt.agent?.id || '').trim()) problems.push('agent id is required');
  if (receipt.agent?.type !== 'enterprise-harness:implementer') problems.push('agent type must be enterprise-harness:implementer');
  const executions = Array.isArray(receipt.executions) ? receipt.executions : [];
  const phases = new Set(executions.map((item) => String(item?.phase || '').toUpperCase()));
  for (const phase of REQUIRED_PHASES[strategy] || []) {
    if (!phases.has(phase)) problems.push(`${strategy} requires ${phase} evidence`);
  }
  for (const execution of executions) {
    const phase = String(execution?.phase || '').toUpperCase();
    if (!phase) problems.push('execution phase is required');
    if (!Array.isArray(execution?.argv) || execution.argv.length === 0) problems.push(`${phase || 'execution'} argv is required`);
    if (!Number.isInteger(execution?.exitCode)) problems.push(`${phase || 'execution'} exitCode is required`);
    if (!execution?.startedAt || !execution?.finishedAt) problems.push(`${phase || 'execution'} timestamps are required`);
  }
  if (strategy === 'tdd' && executions.some((item) => String(item.phase).toUpperCase() === 'RED' && item.exitCode === 0)) {
    problems.push('RED must fail');
  }
  if (requireComplete) {
    const completion = strategy === 'tdd' ? ['RED', 'GREEN', 'REFACTOR']
      : strategy === 'regression' ? ['REPRODUCE', 'VERIFY']
        : strategy === 'characterization' ? ['BASELINE', 'VERIFY']
          : strategy === 'migration' ? ['DRY_RUN', 'APPLY', 'ROLLBACK']
            : strategy === 'generation' ? ['GENERATE', 'VERIFY']
              : ['VERIFY'];
    for (const phase of completion) {
      if (!phases.has(phase)) problems.push(`${strategy} completion requires ${phase}`);
    }
  }
  return problems;
}

export function readTaskExecutionReceipt(root, changeId, taskId, strategy, options = {}) {
  const file = executionReceiptPath(root, changeId, taskId);
  if (!fs.existsSync(file)) return { ok: false, path: file, receipt: null, problems: ['execution receipt is missing'] };
  try {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const problems = validateTaskExecutionReceipt(receipt, { changeId, taskId, strategy, ...options });
    return { ok: problems.length === 0, path: file, receipt, problems };
  } catch (error) {
    return { ok: false, path: file, receipt: null, problems: [`execution receipt is unreadable: ${error.message}`] };
  }
}

export function requiredPrewriteEvidence(strategy) {
  return REQUIRED_PHASES[strategy] || [];
}
