import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  activeChangeId,
  boundHarnessAgent,
  readAgentEvents,
} from './lib/agent-evidence.mjs';
import {
  allowedTaskCommand,
  tddReceiptSpoolPath,
  validateTddReceipt,
} from './lib/tdd-receipts.mjs';
import {
  changedWorktreePaths,
  worktreeSnapshotDigest,
} from './lib/git-evidence.mjs';

function fail(message) {
  console.error(`BLOCK: ${message}`);
  process.exit(2);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value ?? '').digest('hex');
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', shell: false });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function treeDigest(cwd) {
  return worktreeSnapshotDigest(cwd);
}

function changedPaths(cwd) {
  return changedWorktreePaths(cwd);
}

function atomicWriteJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, target);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node harness/plugin/runtime/tdd-run.mjs <change-id> <task-id> <red|green|refactor> -- <command> [args...]');
  process.exit(0);
}
const separator = process.argv.indexOf('--');
if (separator < 0) fail('expected -- before child argv');
const [changeId, taskId, phaseRaw] = process.argv.slice(2, separator);
const childArgv = process.argv.slice(separator + 1);
const phase = String(phaseRaw || '').toUpperCase();
if (!changeId || !taskId || !phaseRaw || childArgv.length === 0) {
  fail('usage: tdd-run <change-id> <task-id> <red|green|refactor> -- <command> [args]');
}
const expected = allowedTaskCommand(taskId, phase);
if (!expected || JSON.stringify(childArgv) !== JSON.stringify(expected)) {
  fail(`child argv is outside the sealed task allowlist: ${JSON.stringify(childArgv)}`);
}

const root = process.cwd();
if (activeChangeId(root) !== changeId) fail(`active change is not ${changeId}`);
const agentId = process.env.CLAUDE_AGENT_ID || process.env.HARNESS_TDD_EXECUTOR_ID;
let binding = agentId
  ? boundHarnessAgent(root, changeId, agentId, 'enterprise-harness:tdd-executor')
  : null;
if (!binding) {
  const events = readAgentEvents(root, changeId);
  const activeIds = [...new Set(events
    .filter((event) => (
      event.kind === 'start'
      && event.observedAgentType === 'enterprise-harness:tdd-executor'
      && path.resolve(event.cwd) === root
    ))
    .map((event) => event.agentId))]
    .filter((id) => boundHarnessAgent(root, changeId, id, 'enterprise-harness:tdd-executor'));
  if (activeIds.length === 1) {
    binding = boundHarnessAgent(
      root,
      changeId,
      activeIds[0],
      'enterprise-harness:tdd-executor',
    );
  }
}
if (!binding) {
  fail('tdd-run requires a uniquely bound active enterprise-harness:tdd-executor');
}

const receiptPath = tddReceiptSpoolPath(root, changeId, taskId);
let receipt;
if (fs.existsSync(receiptPath)) {
  receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
  if (receipt.provenance !== 'tdd-run'
      || receipt.changeId !== changeId
      || receipt.taskId !== taskId
      || receipt.agent?.id !== binding.start.agentId) {
    fail('existing TDD receipt belongs to another execution');
  }
}
const expectedIndex = receipt?.executions?.length || 0;
if (['RED', 'GREEN', 'REFACTOR'][expectedIndex] !== phase) {
  fail(`phase order violation: expected ${['RED', 'GREEN', 'REFACTOR'][expectedIndex] || 'complete'}`);
}

const headBefore = git(['rev-parse', 'HEAD'], root);
const beforeDigest = treeDigest(root);
const startedAt = new Date().toISOString();
const child = spawnSync(childArgv[0], childArgv.slice(1), {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
});
const finishedAt = new Date().toISOString();
const headAfter = git(['rev-parse', 'HEAD'], root);
const afterDigest = treeDigest(root);

process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');

if (!receipt) {
  receipt = {
    receiptVersion: 1,
    provenance: 'tdd-run',
    changeId,
    taskId,
    agent: {
      id: binding.start.agentId,
      type: 'enterprise-harness:tdd-executor',
    },
    worktree: {
      path: root,
      gitCommonDir: path.resolve(root, git(['rev-parse', '--git-common-dir'], root)),
      headBefore,
      headAfter,
      treeDigestBefore: beforeDigest,
      treeDigestAfter: afterDigest,
    },
    changedPaths: [],
    executions: [],
  };
} else {
  receipt.worktree.headAfter = headAfter;
  receipt.worktree.treeDigestAfter = afterDigest;
}
receipt.changedPaths = changedPaths(root);
receipt.executions.push({
  phase,
  argv: childArgv,
  exitCode: child.status ?? 1,
  signal: child.signal || null,
  startedAt,
  finishedAt,
  stdoutDigest: sha256(child.stdout || ''),
  stderrDigest: sha256(child.stderr || ''),
});
const problems = validateTddReceipt(receipt, {
  root,
  changeId,
  taskId,
  allowBootstrap: false,
  requireComplete: phase === 'REFACTOR',
});
if (problems.length) fail(`refusing invalid TDD receipt: ${problems.join('; ')}`);
atomicWriteJson(receiptPath, receipt);
console.log(`TDD_RECEIPT=${receiptPath}`);
process.exit(child.status ?? 1);
