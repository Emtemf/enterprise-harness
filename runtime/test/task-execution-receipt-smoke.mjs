import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  readTaskExecutionReceipt,
  taskExecutionReceiptPath,
  validateTaskExecutionReceipt,
} from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const base = {
  receiptVersion: 2,
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
    { phase: 'RED', argv: ['node', '--test'], outcome: 'exit', exitCode: 1, signal: null, spawnError: null, startedAt: '2026-08-16T00:00:00.000Z', finishedAt: '2026-08-16T00:00:01.000Z', stdoutDigest: 'e'.repeat(64), stderrDigest: 'f'.repeat(64) },
    { phase: 'GREEN', argv: ['node', '--test'], outcome: 'exit', exitCode: 0, signal: null, spawnError: null, startedAt: '2026-08-16T00:00:02.000Z', finishedAt: '2026-08-16T00:00:03.000Z', stdoutDigest: 'e'.repeat(64), stderrDigest: 'f'.repeat(64) },
    { phase: 'REFACTOR', argv: ['node', '--test'], outcome: 'exit', exitCode: 0, signal: null, spawnError: null, startedAt: '2026-08-16T00:00:04.000Z', finishedAt: '2026-08-16T00:00:05.000Z', stdoutDigest: 'e'.repeat(64), stderrDigest: 'f'.repeat(64) },
  ],
  completedAt: '2026-08-16T00:00:00.000Z',
};

assert.deepEqual(validateTaskExecutionReceipt(base), []);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executions: base.executions.map((execution) => ({ ...execution, exitCode: 0 })),
  }).join('; '),
  /RED execution must be a real nonzero process exit/u,
);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executions: base.executions.filter((execution) => execution.phase !== 'REFACTOR'),
  }).join('; '),
  /requires phases RED, GREEN, REFACTOR/u,
);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executions: base.executions.map((execution, index) => index === 0
      ? { ...execution, outcome: 'spawn-error', exitCode: null, spawnError: 'ENOENT' }
      : execution),
  }).join('; '),
  /RED failed to spawn|real nonzero process exit/u,
);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executions: base.executions.map((execution, index) => index === 0
      ? { ...execution, outcome: 'signal', exitCode: null, signal: 'SIGTERM', spawnError: null }
      : execution),
  }).join('; '),
  /RED was terminated by a signal|real nonzero process exit/u,
);
assert.match(
  validateTaskExecutionReceipt({
    ...base,
    executions: base.executions.map((execution, index) => index === 0
      ? { ...execution, outcome: 'spawn-error', exitCode: null, signal: null, spawnError: 'ENOENT' }
      : execution),
  }).join('; '),
  /RED failed to spawn|real nonzero process exit/u,
);

assert.deepEqual(validateTaskExecutionReceipt({
  ...base,
  executionStrategy: 'direct',
  strategyRationale: 'A deterministic metadata-only update has no meaningful failing-test precondition.',
  executions: [{
    phase: 'VERIFY',
    argv: ['node', '--test'],
    outcome: 'exit',
    exitCode: 0,
    signal: null,
    spawnError: null,
    startedAt: '2026-08-16T00:00:00.000Z',
    finishedAt: '2026-08-16T00:00:01.000Z',
    stdoutDigest: 'e'.repeat(64),
    stderrDigest: 'f'.repeat(64),
  }],
}), []);
const branchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-execution-branches-'));
try {
  const branchChangeId = 'receipt-branches';
  const branchTaskId = 'task-1';
  const branchChangeDir = path.join(branchRoot, 'harness', 'changes', branchChangeId);
  fs.mkdirSync(branchChangeDir, { recursive: true });
  fs.writeFileSync(path.join(branchChangeDir, 'tasks.md'), '# Tasks\n', 'utf-8');
  fs.writeFileSync(path.join(branchChangeDir, 'task-commands.json'), JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [branchTaskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'Branch smoke direct execution.',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
  }, null, 2) + '\n');
  const tasksDigest = createHash('sha256').update('# Tasks\n').digest('hex');
  const branchReceipt = {
    receiptVersion: 2,
    provenance: 'runtime-runner',
    changeId: branchChangeId,
    taskId: branchTaskId,
    executionStrategy: 'direct',
    strategyRationale: 'Branch smoke direct execution.',
    agent: { id: 'branch-impl', type: 'enterprise-harness:implementer' },
    worktree: {
      path: branchRoot,
      gitCommonDir: path.join(branchRoot, '.git'),
      headBefore: 'a'.repeat(40),
      headAfter: 'b'.repeat(40),
      treeDigestBefore: 'c'.repeat(64),
      treeDigestAfter: 'd'.repeat(64),
    },
    changedPaths: ['src/example.mjs'],
    inputDigests: { [path.join('harness', 'changes', branchChangeId, 'tasks.md')]: tasksDigest },
    executions: [{
      phase: 'VERIFY',
      argv: ['node', '-e', 'process.exit(0)'],
      outcome: 'exit',
      exitCode: 0,
      signal: null,
      spawnError: null,
      startedAt: '2026-08-16T00:00:00.000Z',
      finishedAt: '2026-08-16T00:00:01.000Z',
      stdoutDigest: 'e'.repeat(64),
      stderrDigest: 'f'.repeat(64),
    }],
    completedAt: '2026-08-16T00:00:01.000Z',
  };
  const branchReceiptPath = taskExecutionReceiptPath(branchRoot, branchChangeId, branchTaskId);
  fs.mkdirSync(path.dirname(branchReceiptPath), { recursive: true });
  fs.writeFileSync(branchReceiptPath, `${JSON.stringify(branchReceipt, null, 2)}\n`);

  assert.deepEqual(readTaskExecutionReceipt(branchRoot, branchChangeId, branchTaskId, {
    root: branchRoot,
    expectedChangeId: branchChangeId,
    expectedTaskId: branchTaskId,
    expectedStrategy: 'direct',
    expectedAgent: 'branch-impl',
    expectedInputDigests: branchReceipt.inputDigests,
    requireTrusted: true,
    requireFreshInputs: true,
  }).problems, []);

  const staleRead = readTaskExecutionReceipt(branchRoot, branchChangeId, branchTaskId, {
    root: branchRoot,
    expectedChangeId: branchChangeId,
    expectedTaskId: branchTaskId,
    requireTrusted: true,
    requireFreshInputs: true,
  });
  assert.equal(staleRead.ok, true);

  const missingFreeze = fs.readFileSync(path.join(branchChangeDir, 'task-commands.json'), 'utf-8');
  fs.rmSync(path.join(branchChangeDir, 'task-commands.json'));
  assert.match(
    readTaskExecutionReceipt(branchRoot, branchChangeId, branchTaskId, {
      root: branchRoot,
      requireTrusted: true,
    }).problems.join('; '),
    /task command freeze is missing/u,
  );
  fs.writeFileSync(path.join(branchChangeDir, 'task-commands.json'), missingFreeze, 'utf-8');

  fs.writeFileSync(path.join(branchChangeDir, 'task-commands.json'), JSON.stringify({
    schemaVersion: 3,
    tasks: {},
  }, null, 2) + '\n');
  assert.match(
    readTaskExecutionReceipt(branchRoot, branchChangeId, branchTaskId, {
      root: branchRoot,
      requireTrusted: true,
    }).problems.join('; '),
    /task is not frozen/u,
  );
  fs.writeFileSync(path.join(branchChangeDir, 'task-commands.json'), JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [branchTaskId]: {
        executionStrategy: 'unknown',
        strategyRationale: 'Branch smoke direct execution.',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
  }, null, 2) + '\n');
  assert.match(
    readTaskExecutionReceipt(branchRoot, branchChangeId, branchTaskId, {
      root: branchRoot,
      requireTrusted: true,
    }).problems.join('; '),
    /executionStrategy is invalid/u,
  );
  fs.writeFileSync(path.join(branchChangeDir, 'task-commands.json'), JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [branchTaskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'different',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
  }, null, 2) + '\n');
  assert.match(
    readTaskExecutionReceipt(branchRoot, branchChangeId, branchTaskId, {
      root: branchRoot,
      requireTrusted: true,
    }).problems.join('; '),
    /strategyRationale does not match the frozen task rationale/u,
  );
  fs.writeFileSync(path.join(branchChangeDir, 'task-commands.json'), JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [branchTaskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'Branch smoke direct execution.',
        verifyCommand: [],
      },
    },
  }, null, 2) + '\n');
  assert.match(
    readTaskExecutionReceipt(branchRoot, branchChangeId, branchTaskId, {
      root: branchRoot,
      requireTrusted: true,
    }).problems.join('; '),
    /frozen task commands are incomplete|argv must be a non-empty string array/u,
  );

  assert.deepEqual(validateTaskExecutionReceipt({
    ...branchReceipt,
    executions: [],
  }).slice(0, 1), ['executions must be a non-empty array']);
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      changedPaths: ['../escape'],
    }).join('; '),
    /changedPaths must contain safe relative paths/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      worktree: { path: 'relative', gitCommonDir: 'relative', headBefore: 'x', headAfter: 'y', treeDigestBefore: 'z', treeDigestAfter: 'w' },
    }).join('; '),
    /worktree.path must be absolute|worktree.gitCommonDir must be absolute/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      inputDigests: {},
    }).join('; '),
    /inputDigests must be a non-empty object/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      executions: [{ ...branchReceipt.executions[0], outcome: 'signal', exitCode: null, signal: 'SIGTERM', spawnError: null }],
    }).join('; '),
    /signal outcome requires signal|terminated by a signal/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      executions: [{ ...branchReceipt.executions[0], outcome: 'spawn-error', exitCode: null, signal: null, spawnError: 'ENOENT' }],
    }).join('; '),
    /spawn-error outcome requires spawnError|failed to spawn/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      executions: [{ ...branchReceipt.executions[0], stdoutDigest: '0'.repeat(10), stderrDigest: '1'.repeat(10) }],
    }).join('; '),
    /output digests must be sha256/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      executions: [{ ...branchReceipt.executions[0], startedAt: '2026-08-16T00:00:02.000Z', finishedAt: '2026-08-16T00:00:01.000Z' }],
    }).join('; '),
    /timestamps are invalid/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      executions: [
        { ...branchReceipt.executions[0], phase: 'RED', exitCode: 1 },
        { ...branchReceipt.executions[0], phase: 'RED', startedAt: '2026-08-16T00:00:02.000Z', finishedAt: '2026-08-16T00:00:03.000Z' },
      ],
    }).join('; '),
    /execution phases must be unique|must be phase/u,
  );
  assert.match(
    validateTaskExecutionReceipt({
      ...branchReceipt,
      executionStrategy: 'direct',
      strategyRationale: 'Branch smoke direct execution.',
      inputDigests: { [path.join(branchChangeDir, 'tasks.md')]: '0'.repeat(64) },
      executions: [{
        phase: 'VERIFY',
        argv: ['node', '-e', 'process.exit(0)'],
        outcome: 'exit',
        exitCode: 0,
        signal: null,
        spawnError: null,
        startedAt: '2026-08-16T00:00:00.000Z',
        finishedAt: '2026-08-16T00:00:01.000Z',
        stdoutDigest: 'e'.repeat(64),
        stderrDigest: 'f'.repeat(64),
      }],
    }, { root: branchRoot, expectedChangeId: branchChangeId, expectedTaskId: branchTaskId, expectedStrategy: 'direct', expectedAgent: 'branch-impl', expectedInputDigests: branchReceipt.inputDigests, requireTrusted: true }).join('; '),
    /receipt input digests do not exactly match the execute handoff|task is not frozen/u,
  );
  const incomplete = validateTaskExecutionReceipt({
    ...branchReceipt,
    completedAt: undefined,
    executions: [{
      phase: 'VERIFY',
      argv: ['node', '-e', 'process.exit(0)'],
      outcome: 'exit',
      exitCode: 0,
      signal: null,
      spawnError: null,
      startedAt: '2026-08-16T00:00:00.000Z',
      finishedAt: '2026-08-16T00:00:01.000Z',
      stdoutDigest: 'e'.repeat(64),
      stderrDigest: 'f'.repeat(64),
    }],
  }, { allowIncomplete: true });
  assert.match(incomplete.join('; '), /completedAt must be an ISO timestamp for a complete receipt/u);
} finally {
  fs.rmSync(branchRoot, { recursive: true, force: true });
}

console.log(`PASS task-execution-receipt ${mode}`);

