import assert from 'node:assert/strict';
import {
  validateTaskExecutionReceipt,
} from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const base = {
  receiptVersion: 1,
  provenance: 'runtime-runner',
  changeId: 'implement-slice',
  taskId: 'task-1',
  executionStrategy: 'tdd',
  agent: { id: 'executor-1', type: 'enterprise-harness:implementer' },
  worktree: {
    path: '/tmp/implement-slice',
    gitCommonDir: '/tmp/implement-common',
    headBefore: 'a'.repeat(40),
    headAfter: 'b'.repeat(40),
    treeDigestBefore: 'c'.repeat(64),
    treeDigestAfter: 'd'.repeat(64),
  },
  changedPaths: ['src/example.mjs'],
  inputDigests: {
    'harness/changes/implement-slice/design.md': 'a'.repeat(64),
    'harness/changes/implement-slice/tasks.md': 'b'.repeat(64),
  },
  executions: [
    { phase: 'RED', argv: ['node', '--test'], exitCode: 1, startedAt: '2026-08-16T00:00:00.000Z', finishedAt: '2026-08-16T00:00:01.000Z', stdoutDigest: 'e'.repeat(64), stderrDigest: 'f'.repeat(64) },
    { phase: 'GREEN', argv: ['node', '--test'], exitCode: 0, startedAt: '2026-08-16T00:00:02.000Z', finishedAt: '2026-08-16T00:00:03.000Z', stdoutDigest: 'e'.repeat(64), stderrDigest: 'f'.repeat(64) },
    { phase: 'REFACTOR', argv: ['node', '--test'], exitCode: 0, startedAt: '2026-08-16T00:00:04.000Z', finishedAt: '2026-08-16T00:00:05.000Z', stdoutDigest: 'e'.repeat(64), stderrDigest: 'f'.repeat(64) },
  ],
  completedAt: '2026-08-16T00:00:00.000Z',
};

assert.deepEqual(validateTaskExecutionReceipt(base), []);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executions: base.executions.map((execution) => ({ ...execution, exitCode: 0 })),
  }).join('; '),
  /RED execution must fail/u,
);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executions: base.executions.filter((execution) => execution.phase !== 'REFACTOR'),
  }).join('; '),
  /requires phases RED, GREEN, REFACTOR/u,
);
assert.deepEqual(validateTaskExecutionReceipt({
  ...base,
  executionStrategy: 'direct',
  strategyRationale: 'A deterministic metadata-only update has no meaningful failing-test precondition.',
  executions: [{
    phase: 'VERIFY',
    argv: ['node', '--test'],
    exitCode: 0,
    startedAt: '2026-08-16T00:00:00.000Z',
    finishedAt: '2026-08-16T00:00:01.000Z',
    stdoutDigest: 'e'.repeat(64),
    stderrDigest: 'f'.repeat(64),
  }],
}), []);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executionStrategy: 'direct',
    executions: [{
    phase: 'VERIFY',
    argv: ['node', '--test'],
    exitCode: 0,
    startedAt: '2026-08-16T00:00:00.000Z',
    finishedAt: '2026-08-16T00:00:01.000Z',
    stdoutDigest: 'e'.repeat(64),
    stderrDigest: 'f'.repeat(64),
  }],
  }).join('; '),
  /strategyRationale is required/u,
);
assert.match(
  validateTaskExecutionReceipt({ ...base, extra: true }).join('; '),
  /unknown property extra/u,
);

console.log(`PASS task-execution-receipt ${mode}`);
