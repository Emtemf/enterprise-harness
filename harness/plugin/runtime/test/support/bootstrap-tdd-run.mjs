import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  changedWorktreePaths,
  headSnapshotDigest,
  runGit as runGitEvidence,
  worktreeSnapshotDigest,
} from '../../lib/git-evidence.mjs';

function fail(message) {
  console.error(`BLOCK: ${message}`);
  process.exit(2);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value ?? '').digest('hex');
}

function runGit(args, cwd) {
  try {
    const output = runGitEvidence(args, cwd);
    return Buffer.isBuffer(output) ? output.toString('utf-8').trim() : output.trim();
  } catch (error) {
    fail(error.message);
  }
}

function atomicWriteJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, target);
}

const [requestedChangeId, requestedTaskId, requestedPhase] = process.argv.slice(2);
const refreshMetadata = requestedPhase === 'refresh-metadata';
const separator = process.argv.indexOf('--');
if (!refreshMetadata && separator < 0) fail('expected -- before child argv');

const [changeId, taskId, rawPhase] = refreshMetadata
  ? [requestedChangeId, requestedTaskId, requestedPhase]
  : process.argv.slice(2, separator);
const childArgv = process.argv.slice(separator + 1);
const phase = String(rawPhase || '').toUpperCase();
if (changeId !== 'plugin-runtime-agent-dispatch-hardening' || taskId !== 'task-1') {
  fail('bootstrap runner is restricted to plugin-runtime-agent-dispatch-hardening/task-1');
}
if (!['RED', 'GREEN', 'REFACTOR', 'REFRESH-METADATA'].includes(phase)) {
  fail(`unsupported phase: ${rawPhase}`);
}

const mode = phase === 'REFACTOR' ? 'verify' : phase.toLowerCase();
const expected = [
  'node',
  'harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs',
  mode,
];
if (!refreshMetadata && JSON.stringify(childArgv) !== JSON.stringify(expected)) {
  fail(`child argv is not the Task 1 allowed command: ${JSON.stringify(childArgv)}`);
}

const cwd = process.cwd();
const gitCommonDirRaw = runGit(['rev-parse', '--git-common-dir'], cwd);
const gitCommonDir = path.resolve(cwd, gitCommonDirRaw);
const bootstrapPath = fileURLToPath(import.meta.url);
const receiptPath = path.join(
  gitCommonDir,
  'enterprise-harness',
  'receipts',
  changeId,
  'tdd',
  `${taskId}.json`,
);
if (refreshMetadata) {
  if (!fs.existsSync(receiptPath)) fail('cannot refresh a missing bootstrap receipt');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
  if (receipt.provenance !== 'runner-bootstrap'
      || receipt.changeId !== changeId
      || receipt.taskId !== taskId
      || !Array.isArray(receipt.executions)
      || receipt.executions.length === 0) {
    fail('existing receipt is not a populated Task 1 bootstrap receipt');
  }
  receipt.bootstrap = {
    scriptPath: path.relative(cwd, bootstrapPath).split(path.sep).join('/'),
    scriptSha256: sha256(fs.readFileSync(bootstrapPath)),
    nodeVersion: process.version,
  };
  receipt.worktree = {
    ...receipt.worktree,
    path: cwd,
    gitCommonDir,
    headAfter: runGit(['rev-parse', 'HEAD'], cwd),
    treeDigestBefore: headSnapshotDigest(cwd),
    treeDigestAfter: worktreeSnapshotDigest(cwd),
  };
  receipt.changedPaths = changedWorktreePaths(cwd);
  atomicWriteJson(receiptPath, receipt);
  console.log(`BOOTSTRAP_RECEIPT=${receiptPath}`);
  process.exit(0);
}
const headBefore = runGit(['rev-parse', 'HEAD'], cwd);
const treeBefore = worktreeSnapshotDigest(cwd);
const startedAt = new Date().toISOString();
const child = spawnSync(childArgv[0], childArgv.slice(1), {
  cwd,
  encoding: 'utf-8',
  shell: false,
});
const finishedAt = new Date().toISOString();
const headAfter = runGit(['rev-parse', 'HEAD'], cwd);
const treeAfter = worktreeSnapshotDigest(cwd);

process.stdout.write(child.stdout || '');
process.stderr.write(child.stderr || '');

let receipt = {
  receiptVersion: 1,
  provenance: 'runner-bootstrap',
  changeId,
  taskId,
  agent: {
    id: process.env.CLAUDE_AGENT_ID || 'bootstrap-tdd-executor',
    type: 'enterprise-harness:tdd-executor',
  },
  bootstrap: {
    scriptPath: path.relative(cwd, bootstrapPath).split(path.sep).join('/'),
    scriptSha256: sha256(fs.readFileSync(bootstrapPath)),
    nodeVersion: process.version,
  },
  worktree: {
    path: cwd,
    gitCommonDir,
    headBefore,
    headAfter,
    treeDigestBefore: treeBefore,
    treeDigestAfter: treeAfter,
  },
  changedPaths: [],
  executions: [],
};
if (fs.existsSync(receiptPath)) {
  const previous = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
  if (previous.provenance !== 'runner-bootstrap'
      || previous.changeId !== changeId
      || previous.taskId !== taskId
      || previous.bootstrap?.scriptSha256 !== receipt.bootstrap.scriptSha256) {
    fail('existing bootstrap receipt does not match this runner');
  }
  receipt = {
    ...previous,
    worktree: {
      ...previous.worktree,
      path: cwd,
      gitCommonDir,
      headAfter,
      treeDigestAfter: treeAfter,
    },
  };
}

const execution = {
  phase,
  argv: childArgv,
  exitCode: child.status ?? 1,
  signal: child.signal || null,
  startedAt,
  finishedAt,
  stdoutDigest: sha256(child.stdout || ''),
  stderrDigest: sha256(child.stderr || ''),
};
receipt.executions = [
  ...receipt.executions.filter((item) => item.phase !== phase),
  execution,
].sort((left, right) => ['RED', 'GREEN', 'REFACTOR'].indexOf(left.phase)
  - ['RED', 'GREEN', 'REFACTOR'].indexOf(right.phase));
receipt.changedPaths = changedWorktreePaths(cwd);
atomicWriteJson(receiptPath, receipt);
console.log(`BOOTSTRAP_RECEIPT=${receiptPath}`);
process.exit(child.status ?? 1);
