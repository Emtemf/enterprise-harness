import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gitCommonDir } from './agent-evidence.mjs';

const COMMANDS = {
  'task-1': 'task1-authoritative-evidence-smoke.mjs',
  'task-2': 'task2-plugin-agent-smoke.mjs',
  'task-3': 'task3-gate-completion-smoke.mjs',
  'task-4': 'task4-release-acceptance-smoke.mjs',
};
const PHASES = ['RED', 'GREEN', 'REFACTOR'];
const HEX_64 = /^[0-9a-f]{64}$/;
const GIT_ID = /^[0-9a-f]{40,64}$/;
const TASK1_BOOTSTRAP_PATHS = new Set([
  '.claude/settings.json',
  'harness/evidence-policy.json',
  'harness/plugin/runtime/cli.mjs',
  'harness/plugin/runtime/evidence-import.mjs',
  'harness/plugin/runtime/hooks/post-agent.mjs',
  'harness/plugin/runtime/hooks/pre-agent.mjs',
  'harness/plugin/runtime/hooks/subagent-start.mjs',
  'harness/plugin/runtime/hooks/subagent-stop.mjs',
  'harness/plugin/runtime/lib/agent-evidence.mjs',
  'harness/plugin/runtime/lib/evidence-policy.mjs',
  'harness/plugin/runtime/lib/git-evidence.mjs',
  'harness/plugin/runtime/lib/tdd-receipts.mjs',
  'harness/plugin/runtime/migrate-evidence-policy.mjs',
  'harness/plugin/runtime/migrate.mjs',
  'harness/plugin/runtime/tdd-run.mjs',
  'harness/plugin/runtime/test/agent-lifecycle-hook-smoke.mjs',
  'harness/plugin/runtime/test/evidence-policy-contract-smoke.mjs',
  'harness/plugin/runtime/test/support/bootstrap-tdd-run.mjs',
  'harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs',
  'harness/plugin/runtime/test/tdd-receipt-contract-smoke.mjs',
  'harness/plugin/runtime/upgrade.mjs',
  'harness/templates/state.json',
  'hooks/hooks.json',
]);

export function allowedTaskCommand(taskId, rawPhase) {
  const phase = String(rawPhase || '').toUpperCase();
  const file = COMMANDS[taskId];
  if (!file || !PHASES.includes(phase)) return null;
  const mode = phase === 'REFACTOR' ? 'verify' : phase.toLowerCase();
  return ['node', `harness/plugin/runtime/test/${file}`, mode];
}

export function tddReceiptSpoolPath(root, changeId, taskId) {
  return path.join(
    gitCommonDir(root),
    'enterprise-harness',
    'receipts',
    changeId,
    'tdd',
    `${taskId}.json`,
  );
}

export function receiptDigest(receipt) {
  return crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
}

function isSafeRelative(value) {
  return typeof value === 'string'
    && value.length > 0
    && !path.isAbsolute(value)
    && !value.split(/[\\/]/).includes('..');
}

export function validateTddReceipt(receipt, options = {}) {
  const {
    root = process.cwd(),
    changeId,
    taskId,
    allowBootstrap = false,
    requireComplete = false,
  } = options;
  const problems = [];
  if (!receipt || typeof receipt !== 'object') return ['receipt is not an object'];
  if (receipt.receiptVersion !== 1) problems.push('receiptVersion must be 1');
  if (changeId && receipt.changeId !== changeId) problems.push('changeId mismatch');
  if (taskId && receipt.taskId !== taskId) problems.push('taskId mismatch');
  if (!COMMANDS[receipt.taskId]) problems.push('unknown task id');
  if (receipt.agent?.type !== 'enterprise-harness:tdd-executor') {
    problems.push('agent type must be enterprise-harness:tdd-executor');
  }
  if (!String(receipt.agent?.id || '').trim()) problems.push('agent id is required');

  const worktree = receipt.worktree || {};
  if (!path.isAbsolute(String(worktree.path || ''))) problems.push('worktree path must be absolute');
  if (!path.isAbsolute(String(worktree.gitCommonDir || ''))) problems.push('git common dir must be absolute');
  if (!GIT_ID.test(String(worktree.headBefore || ''))) problems.push('headBefore must be a git id');
  if (!GIT_ID.test(String(worktree.headAfter || ''))) problems.push('headAfter must be a git id');
  if (!HEX_64.test(String(worktree.treeDigestBefore || ''))) problems.push('treeDigestBefore must be sha256');
  if (!HEX_64.test(String(worktree.treeDigestAfter || ''))) problems.push('treeDigestAfter must be sha256');

  if (!Array.isArray(receipt.changedPaths)
      || receipt.changedPaths.some((value) => !isSafeRelative(value))) {
    problems.push('changedPaths must contain safe relative paths');
  }

  if (receipt.provenance === 'runner-bootstrap') {
    if (!allowBootstrap) problems.push('bootstrap provenance is not allowed');
    if (receipt.changeId !== 'plugin-runtime-agent-dispatch-hardening' || receipt.taskId !== 'task-1') {
      problems.push('bootstrap provenance is restricted to hardening task-1');
    }
    const scriptPath = receipt.bootstrap?.scriptPath;
    const absolute = isSafeRelative(scriptPath) ? path.join(root, scriptPath) : null;
    if (!absolute || !fs.existsSync(absolute)) {
      problems.push('bootstrap script is missing');
    } else {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
      if (actual !== receipt.bootstrap?.scriptSha256) problems.push('bootstrap script digest mismatch');
    }
    if (receipt.bootstrap?.nodeVersion !== process.version) problems.push('bootstrap node version mismatch');
    if (!Array.isArray(receipt.changedPaths)
        || receipt.changedPaths.length === 0
        || receipt.changedPaths.some((relative) => !TASK1_BOOTSTRAP_PATHS.has(relative))) {
      problems.push('bootstrap changedPaths escape the reviewed Task 1 surface');
    }
  } else if (receipt.provenance !== 'tdd-run') {
    problems.push('unsupported receipt provenance');
  }

  const executions = Array.isArray(receipt.executions) ? receipt.executions : [];
  if (requireComplete && executions.length !== 3) problems.push('complete receipt needs exactly three phases');
  if (executions.length > 3) problems.push('receipt has too many executions');
  let previousFinished = -Infinity;
  for (let index = 0; index < executions.length; index += 1) {
    const execution = executions[index];
    const phase = String(execution?.phase || '').toUpperCase();
    if (phase !== PHASES[index]) problems.push(`phase ${index + 1} must be ${PHASES[index]}`);
    const expected = allowedTaskCommand(receipt.taskId, phase);
    if (!expected || JSON.stringify(execution.argv) !== JSON.stringify(expected)) {
      problems.push(`${phase || 'execution'} argv is not allowed`);
    }
    if (phase === 'RED' && execution.exitCode === 0) problems.push('RED must fail');
    if (phase !== 'RED' && execution.exitCode !== 0) problems.push(`${phase} must succeed`);
    const started = Date.parse(execution.startedAt);
    const finished = Date.parse(execution.finishedAt);
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
      problems.push(`${phase} timestamps are invalid`);
    } else if (started < previousFinished) {
      problems.push(`${phase} starts before the previous phase finished`);
    }
    previousFinished = finished;
    if (!HEX_64.test(String(execution.stdoutDigest || ''))
        || !HEX_64.test(String(execution.stderrDigest || ''))) {
      problems.push(`${phase} output digests must be sha256`);
    }
  }
  return problems;
}

export function readAndValidateTddReceipt(receiptPath, options = {}) {
  if (!fs.existsSync(receiptPath)) {
    return { ok: false, path: receiptPath, receipt: null, problems: ['receipt is missing'] };
  }
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
    const problems = validateTddReceipt(receipt, options);
    return { ok: problems.length === 0, path: receiptPath, receipt, problems };
  } catch (error) {
    return { ok: false, path: receiptPath, receipt: null, problems: [error.message] };
  }
}
