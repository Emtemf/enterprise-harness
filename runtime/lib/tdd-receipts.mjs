import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gitCommonDir } from './agent-evidence.mjs';
import {
  assertSafeId,
  isSafeId,
  isSafeRelativePath,
  resolveChild,
} from './safe-paths.mjs';

const PHASES = ['RED', 'GREEN', 'REFACTOR'];
const HEX_64 = /^[0-9a-f]{64}$/;
const GIT_ID = /^[0-9a-f]{40,64}$/;
const TASK1_BOOTSTRAP_PATHS = new Set([
  '.claude/settings.json',
  'harness/evidence-policy.json',
  'runtime/cli.mjs',
  'runtime/evidence-import.mjs',
  'runtime/hooks/post-agent.mjs',
  'runtime/hooks/pre-agent.mjs',
  'runtime/hooks/subagent-start.mjs',
  'runtime/hooks/subagent-stop.mjs',
  'runtime/lib/agent-evidence.mjs',
  'runtime/lib/evidence-policy.mjs',
  'runtime/lib/git-evidence.mjs',
  'runtime/lib/import-validation.mjs',
  'runtime/lib/tdd-receipts.mjs',
  'runtime/migrate-evidence-policy.mjs',
  'runtime/migrate.mjs',
  'runtime/tdd-run.mjs',
  'runtime/test/agent-lifecycle-hook-smoke.mjs',
  'runtime/test/evidence-policy-contract-smoke.mjs',
  'runtime/test/evidence-import-adversarial-smoke.mjs',
  'runtime/test/support/bootstrap-tdd-run.mjs',
  'runtime/test/task1-authoritative-evidence-smoke.mjs',
  'runtime/test/tdd-receipt-contract-smoke.mjs',
  'runtime/upgrade.mjs',
  'harness/templates/state.json',
  'hooks/hooks.json',
]);

const PHASE_FIELDS = {
  RED: 'redCommand',
  GREEN: 'greenCommand',
  REFACTOR: 'refactorCommand',
};

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`);
  }
}

export function commandPolicyPath(root) {
  return path.join(root, 'harness', 'command-policy.json');
}

export function taskCommandsPath(root, changeId) {
  const changeRoot = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  return path.join(changeRoot, 'task-commands.json');
}

export function validateProjectCommand(policy, argv) {
  const problems = [];
  if (policy?.schemaVersion !== 1) problems.push('command policy schemaVersion must be 1');
  const build = policy?.build;
  if (!['maven', 'command'].includes(build?.type)) problems.push('build.type must be maven or command');
  if (!Array.isArray(build?.executables) || build.executables.length === 0) {
    problems.push('build.executables must be a non-empty array');
  }
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((item) => typeof item !== 'string' || !item)) {
    problems.push('task command must be a non-empty string argv array');
    return problems;
  }
  if (Array.isArray(build?.executables) && !build.executables.includes(argv[0])) {
    problems.push(`executable is not allowed: ${argv[0]}`);
  }
  if (build?.type === 'maven') {
    if (!Array.isArray(build.allowedGoals) || build.allowedGoals.length === 0) {
      problems.push('maven policy requires allowedGoals');
    } else if (!argv.slice(1).some((arg) => build.allowedGoals.includes(arg))) {
      problems.push('maven command does not contain an allowed goal');
    }
  }
  return problems;
}

export function loadTaskCommand(root, changeId, taskId, rawPhase) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  const phase = String(rawPhase || '').toUpperCase();
  if (!PHASES.includes(phase)) return { ok: false, problems: ['phase is invalid'] };
  const policyFile = commandPolicyPath(root);
  const tasksFile = taskCommandsPath(root, changeId);
  if (!fs.existsSync(policyFile)) {
    return { ok: false, problems: [`command policy is missing: ${path.relative(root, policyFile)}`] };
  }
  if (!fs.existsSync(tasksFile)) {
    return { ok: false, problems: [`task command freeze is missing: ${path.relative(root, tasksFile)}`] };
  }
  try {
    const policy = readJson(policyFile, 'command policy');
    const frozen = readJson(tasksFile, 'task command freeze');
    const task = frozen?.tasks?.[taskId];
    const field = PHASE_FIELDS[phase];
    const argv = task?.[field] || (phase === 'REFACTOR' ? task?.verifyCommand : null);
    const problems = [];
    if (frozen?.schemaVersion !== 1) problems.push('task command schemaVersion must be 1');
    if (!task) problems.push(`task is not frozen: ${taskId}`);
    if (!argv) problems.push(`${field} is missing for ${taskId}`);
    if (argv) problems.push(...validateProjectCommand(policy, argv));
    return { ok: problems.length === 0, argv: problems.length ? null : argv, policy, task, problems };
  } catch (error) {
    return { ok: false, problems: [error.message] };
  }
}

export function allowedTaskCommand(root, changeId, taskId, rawPhase) {
  return loadTaskCommand(root, changeId, taskId, rawPhase).argv || null;
}

export function tddReceiptSpoolPath(root, changeId, taskId) {
  assertSafeId(taskId, 'taskId');
  const receiptRoot = path.join(gitCommonDir(root), 'enterprise-harness', 'receipts');
  const changeRoot = resolveChild(receiptRoot, changeId, 'changeId');
  const tddRoot = path.join(changeRoot, 'tdd');
  return path.join(
    tddRoot,
    `${taskId}.json`,
  );
}

export function receiptDigest(receipt) {
  return crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
}

export function isSafeEvidenceId(value) {
  return isSafeId(value);
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
  if (!isSafeEvidenceId(receipt.changeId)) problems.push('changeId is unsafe');
  if (!isSafeEvidenceId(receipt.taskId)) problems.push('taskId is unsafe');
  if (changeId && receipt.changeId !== changeId) problems.push('changeId mismatch');
  if (taskId && receipt.taskId !== taskId) problems.push('taskId mismatch');
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
      || receipt.changedPaths.some((value) => !isSafeRelativePath(value))) {
    problems.push('changedPaths must contain safe relative paths');
  }

  if (receipt.provenance === 'runner-bootstrap') {
    if (!allowBootstrap) problems.push('bootstrap provenance is not allowed');
    if (receipt.taskId !== 'task-1') {
      problems.push('bootstrap provenance is restricted to the first task of any change');
    }
    const scriptPath = receipt.bootstrap?.scriptPath;
    const absolute = isSafeRelativePath(scriptPath) ? path.join(root, scriptPath) : null;
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
    const expected = allowedTaskCommand(root, receipt.changeId, receipt.taskId, phase);
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
