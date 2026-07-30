import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  allowedTaskCommand,
  isSafeEvidenceId,
  readAndValidateTddReceipt,
  validateProjectCommand,
  validateTddReceipt,
} from '../lib/tdd-receipts.mjs';
import {
  changedWorktreePaths,
  changedPathsBetween,
  headSnapshotDigest,
  worktreeSnapshotDigest,
} from '../lib/git-evidence.mjs';

const mode = process.argv[2] || 'verify';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-tdd-receipt-'));
const bootstrapRel = 'harness/plugin/runtime/test/support/bootstrap-tdd-run.mjs';
const bootstrapPath = path.join(root, bootstrapRel);
fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true });
fs.writeFileSync(bootstrapPath, 'bootstrap-fixture\n');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
};
git('init', '-q');
git('config', 'user.email', 'harness@example.invalid');
git('config', 'user.name', 'Harness Smoke');
git('add', '.');
git('commit', '-qm', 'baseline');
const baselineHead = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
}).stdout.trim();
const cleanDigest = worktreeSnapshotDigest(root);
assert.equal(cleanDigest, headSnapshotDigest(root), 'clean worktree and HEAD inventories must match');
fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
fs.writeFileSync(path.join(root, '.claude/settings.json'), '{}\n');
assert.deepEqual(changedWorktreePaths(root), ['.claude/settings.json']);
assert.notEqual(
  worktreeSnapshotDigest(root),
  cleanDigest,
  'untracked path and content must change the canonical worktree digest',
);
git('add', '.claude/settings.json');
git('commit', '-qm', 'hidden path');
assert.deepEqual(changedPathsBetween(root, baselineHead), ['.claude/settings.json']);
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const mavenChange = 'maven-change';
const mavenTask = 'task-add-order-api';
fs.mkdirSync(path.join(root, 'harness', 'changes', mavenChange), { recursive: true });
fs.writeFileSync(path.join(root, 'harness', 'command-policy.json'), `${JSON.stringify({
  schemaVersion: 1,
  build: {
    type: 'maven',
    executables: ['./mvnw', 'mvn'],
    allowedGoals: ['test', 'verify'],
  },
})}\n`);
fs.writeFileSync(
  path.join(root, 'harness', 'changes', mavenChange, 'task-commands.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    tasks: {
      [mavenTask]: {
        redCommand: ['./mvnw', '-pl', 'order-service', '-Dtest=OrderTest', 'test'],
        greenCommand: ['./mvnw', '-pl', 'order-service', '-Dtest=OrderTest', 'test'],
        verifyCommand: ['./mvnw', 'verify'],
      },
    },
  })}\n`,
);
assert.deepEqual(
  allowedTaskCommand(root, mavenChange, mavenTask, 'RED'),
  ['./mvnw', '-pl', 'order-service', '-Dtest=OrderTest', 'test'],
);
assert.deepEqual(
  allowedTaskCommand(root, mavenChange, mavenTask, 'REFACTOR'),
  ['./mvnw', 'verify'],
);
assert.notDeepEqual(
  validateProjectCommand(
    { schemaVersion: 1, build: { type: 'maven', executables: ['./mvnw'], allowedGoals: ['test'] } },
    ['bash', '-lc', 'mvn test'],
  ),
  [],
);
assert.notDeepEqual(
  validateProjectCommand(
    { schemaVersion: 1, build: { type: 'maven', executables: ['./mvnw'], allowedGoals: ['test'] } },
    ['./mvnw', 'deploy'],
  ),
  [],
);
const command = (phase) => [
  'node',
  'harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs',
  phase === 'REFACTOR' ? 'verify' : phase.toLowerCase(),
];
fs.writeFileSync(path.join(root, 'harness', 'command-policy.json'), `${JSON.stringify({
  schemaVersion: 1,
  build: {
    type: 'command',
    executables: ['node'],
  },
})}\n`);
const hardeningChange = path.join(root, 'harness', 'changes', 'test-dynamic-change');
fs.mkdirSync(hardeningChange, { recursive: true });
fs.writeFileSync(path.join(hardeningChange, 'task-commands.json'), `${JSON.stringify({
  schemaVersion: 1,
  tasks: {
    'task-1': {
      redCommand: command('RED'),
      greenCommand: command('GREEN'),
      refactorCommand: command('REFACTOR'),
    },
  },
})}\n`);
const base = {
  receiptVersion: 1,
  provenance: 'runner-bootstrap',
  changeId: 'test-dynamic-change',
  taskId: 'task-1',
  agent: { id: 'agent-1', type: 'enterprise-harness:tdd-executor' },
  bootstrap: {
    scriptPath: bootstrapRel,
    scriptSha256: digest('bootstrap-fixture\n'),
    nodeVersion: process.version,
  },
  worktree: {
    path: root,
    gitCommonDir: path.join(root, '.git'),
    headBefore: 'a'.repeat(40),
    headAfter: 'a'.repeat(40),
    treeDigestBefore: digest('before'),
    treeDigestAfter: digest('after'),
  },
  changedPaths: ['harness/plugin/runtime/lib/tdd-receipts.mjs'],
  executions: [
    { phase: 'RED', argv: command('RED'), exitCode: 1, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z', stdoutDigest: digest('red-out'), stderrDigest: digest('red-err') },
    { phase: 'GREEN', argv: command('GREEN'), exitCode: 0, startedAt: '2026-01-01T00:00:02.000Z', finishedAt: '2026-01-01T00:00:03.000Z', stdoutDigest: digest('green-out'), stderrDigest: digest('green-err') },
    { phase: 'REFACTOR', argv: command('REFACTOR'), exitCode: 0, startedAt: '2026-01-01T00:00:04.000Z', finishedAt: '2026-01-01T00:00:05.000Z', stdoutDigest: digest('refactor-out'), stderrDigest: digest('refactor-err') },
  ],
};
const options = {
  root,
  changeId: base.changeId,
  taskId: base.taskId,
  allowBootstrap: true,
  requireComplete: true,
};
assert.deepEqual(validateTddReceipt(base, options), []);
assert.equal(isSafeEvidenceId('task-1'), true);
assert.equal(isSafeEvidenceId('../task-1'), false);
assert.equal(isSafeEvidenceId('change/../../escape'), false);
assert.notDeepEqual(
  validateTddReceipt(base, { ...options, allowBootstrap: false }),
  [],
  'bootstrap provenance is never accepted by the normal path',
);

const cases = [
  ['phase order', { ...base, executions: [base.executions[1], base.executions[0], base.executions[2]] }],
  ['RED zero', { ...base, executions: [{ ...base.executions[0], exitCode: 0 }, ...base.executions.slice(1)] }],
  ['GREEN nonzero', { ...base, executions: [base.executions[0], { ...base.executions[1], exitCode: 1 }, base.executions[2]] }],
  ['command allowlist', { ...base, executions: [{ ...base.executions[0], argv: ['bash', '-lc', 'true'] }, ...base.executions.slice(1)] }],
  ['runner digest', { ...base, bootstrap: { ...base.bootstrap, scriptSha256: '0'.repeat(64) } }],
  ['time overlap', { ...base, executions: [base.executions[0], { ...base.executions[1], startedAt: '2026-01-01T00:00:00.500Z' }, base.executions[2]] }],
  ['invalid digest', { ...base, executions: [{ ...base.executions[0], stdoutDigest: 'forged' }, ...base.executions.slice(1)] }],
  ['path escape', { ...base, changedPaths: ['../outside'] }],
  ['wrong bootstrap task', { ...base, taskId: 'task-2' }],
];
for (const [name, receipt] of cases) {
  assert.notDeepEqual(validateTddReceipt(receipt, options), [], `${name} must fail`);
}
assert.equal(
  readAndValidateTddReceipt(path.join(root, 'missing.json'), options).ok,
  false,
  'missing receipt must fail',
);
const receiptPath = path.join(root, 'receipt.json');
fs.writeFileSync(receiptPath, `${JSON.stringify(base)}\n`);
assert.equal(readAndValidateTddReceipt(receiptPath, options).ok, true);
console.log(`PASS tdd-receipt-contract ${mode}`);
