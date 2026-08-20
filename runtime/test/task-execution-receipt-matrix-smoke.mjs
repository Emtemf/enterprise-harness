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

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-exec-validator-'));
const changeId = 'receipt-validator';
const taskId = 'task-1';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const tasksPath = path.join(changeDir, 'tasks.md');
const taskCommandsPath = path.join(changeDir, 'task-commands.json');
const receiptPath = taskExecutionReceiptPath(root, changeId, taskId);
const tasksDigest = createHash('sha256').update('# Tasks\n').digest('hex');

function validExec(phase, outcome = 'exit', exitCode = 0, signal = null, spawnError = null, startedAt = '2026-08-16T00:00:00.000Z', finishedAt = '2026-08-16T00:00:01.000Z') {
  return {
    phase,
    argv: ['node', '-e', 'process.exit(0)'],
    outcome,
    exitCode,
    signal,
    spawnError,
    startedAt,
    finishedAt,
    stdoutDigest: 'e'.repeat(64),
    stderrDigest: 'f'.repeat(64),
  };
}

function baseReceipt(overrides = {}) {
  return {
    receiptVersion: 2,
    provenance: 'runtime-runner',
    changeId,
    taskId,
    executionStrategy: 'direct',
    strategyRationale: 'Branch matrix direct execution.',
    agent: { id: 'matrix-impl', type: 'enterprise-harness:implementer' },
    worktree: {
      path: root,
      gitCommonDir: path.join(root, '.git'),
      headBefore: 'a'.repeat(40),
      headAfter: 'b'.repeat(40),
      treeDigestBefore: 'c'.repeat(64),
      treeDigestAfter: 'd'.repeat(64),
    },
    changedPaths: ['src/example.mjs'],
    inputDigests: { [path.join('harness', 'changes', changeId, 'tasks.md')]: tasksDigest },
    executions: [validExec('VERIFY', 'exit', 0)],
    completedAt: '2026-08-16T00:00:01.000Z',
    ...overrides,
  };
}

function writeTaskCommands(task) {
  fs.writeFileSync(taskCommandsPath, JSON.stringify({ schemaVersion: 3, tasks: { [taskId]: task } }, null, 2) + '\n');
}

function assertProblems(receipt, opts, pattern) {
  const problems = validateTaskExecutionReceipt(receipt, opts).join('; ');
  assert.match(problems, pattern);
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(tasksPath, '# Tasks\n', 'utf-8');
  writeTaskCommands({
    executionStrategy: 'direct',
    strategyRationale: 'Branch matrix direct execution.',
    verifyCommand: ['node', '-e', 'process.exit(0)'],
  });
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });

  const directReceipt = baseReceipt();
  fs.writeFileSync(receiptPath, `${JSON.stringify(directReceipt, null, 2)}\n`);
  const tddReceipt = baseReceipt({
    executionStrategy: 'tdd',
    strategyRationale: 'TDD branch smoke',
    executions: [
      validExec('RED', 'exit', 1, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'),
      validExec('GREEN', 'exit', 0, null, null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z'),
      validExec('REFACTOR', 'exit', 0, null, null, '2026-08-16T00:00:04.000Z', '2026-08-16T00:00:05.000Z'),
    ],
  });
  const regressionReceipt = baseReceipt({
    executionStrategy: 'regression',
    strategyRationale: 'Regression branch smoke',
    executions: [
      validExec('REPRODUCE', 'exit', 1, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'),
      validExec('VERIFY', 'exit', 0, null, null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z'),
    ],
  });
  const characterizationReceipt = baseReceipt({
    executionStrategy: 'characterization',
    strategyRationale: 'Characterization branch smoke',
    executions: [
      validExec('BASELINE', 'exit', 0, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'),
      validExec('VERIFY', 'exit', 0, null, null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z'),
    ],
  });
  const migrationReceipt = baseReceipt({
    executionStrategy: 'migration',
    strategyRationale: 'Migration branch smoke',
    executions: [
      validExec('DRY_RUN', 'exit', 0, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'),
      validExec('APPLY', 'exit', 0, null, null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z'),
      validExec('ROLLBACK', 'exit', 0, null, null, '2026-08-16T00:00:04.000Z', '2026-08-16T00:00:05.000Z'),
    ],
  });
  const generationReceipt = baseReceipt({
    executionStrategy: 'generation',
    strategyRationale: 'Generation branch smoke',
    executions: [
      validExec('GENERATE', 'exit', 0, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'),
      validExec('VERIFY', 'exit', 0, null, null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z'),
    ],
  });

  assertProblems(null, {}, /must be an object/u);
  assertProblems([], {}, /must be an object/u);
  assertProblems({ ...baseReceipt(), extra: true }, {}, /unknown property extra/u);
  assertProblems({ ...baseReceipt(), receiptVersion: 1 }, {}, /receiptVersion must be 2/u);
  assertProblems({ ...baseReceipt(), changeId: '' }, {}, /changeId is required/u);
  assertProblems({ ...baseReceipt(), taskId: '' }, {}, /taskId is required/u);
  assertProblems({ ...baseReceipt(), executionStrategy: 'bogus' }, {}, /invalid executionStrategy/u);
  assertProblems({ ...baseReceipt(), executionStrategy: 'direct', strategyRationale: '' }, {}, /strategyRationale is required for direct execution/u);
  assertProblems({ ...baseReceipt(), agent: null }, {}, /agent must be an object/u);
  assertProblems({ ...baseReceipt(), agent: { id: '', type: 'enterprise-harness:implementer' } }, {}, /agent.id is required/u);
  assertProblems({ ...baseReceipt(), agent: { id: 'matrix-impl', type: 'other' } }, {}, /agent.type must be enterprise-harness:implementer/u);
  assertProblems({ ...baseReceipt(), worktree: null }, {}, /worktree must be an object/u);
  assertProblems({ ...baseReceipt(), worktree: { path: 'relative', gitCommonDir: 'relative', headBefore: 'x', headAfter: 'y', treeDigestBefore: 'z', treeDigestAfter: 'w' } }, {}, /worktree.path must be absolute|worktree.gitCommonDir must be absolute|worktree.headBefore must be a git id|worktree.headAfter must be a git id|worktree.treeDigestBefore must be sha256|worktree.treeDigestAfter must be sha256/u);
  assertProblems({ ...baseReceipt(), changedPaths: ['../escape'] }, {}, /changedPaths must contain safe relative paths/u);
  assertProblems({ ...baseReceipt(), inputDigests: {} }, {}, /inputDigests must be a non-empty object/u);
  assertProblems({ ...baseReceipt(), inputDigests: { '': 'x' } }, {}, /contains an empty artifact reference|must be a sha256 digest/u);
  assertProblems({ ...baseReceipt(), inputDigests: { [path.join('harness', 'changes', changeId, 'tasks.md')]: 'x' } }, {}, /must be a sha256 digest/u);
  assertProblems({ ...baseReceipt(), inputDigests: { [path.join('harness', 'changes', changeId, 'tasks.md')]: 'f'.repeat(64) } }, { expectedInputDigests: { [path.join('harness', 'changes', changeId, 'tasks.md')]: tasksDigest } }, /receipt input digests do not exactly match the execute handoff/u);
  assertProblems({ ...baseReceipt(), executions: [] }, {}, /executions must be a non-empty array/u);
  assertProblems({ ...baseReceipt(), executions: [{}] }, {}, /executions\[0\] must be an object|unknown execution phase/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), extra: true }] }, {}, /unknown property extra/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), phase: 'OTHER' }] }, {}, /contains an unknown execution phase/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), argv: [] }] }, {}, /argv must be a non-empty string array/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), outcome: 'other' }] }, {}, /outcome is invalid/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), exitCode: null }] }, {}, /exitCode must be an integer/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), signal: 'SIGTERM' }] }, {}, /signal must be null for an exit outcome/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), spawnError: 'ENOENT' }] }, {}, /spawnError must be null for an exit outcome/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY', 'signal', null, null, null), exitCode: 1 }] }, {}, /exitCode must be null for a signal outcome/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY', 'signal', null, null, null), signal: null }] }, {}, /signal is required/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY', 'signal', null, 'SIGTERM', 'ENOENT') }] }, {}, /spawnError must be null for a signal outcome/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY', 'spawn-error', null, null, null), exitCode: 1 }] }, {}, /exitCode must be null for a spawn-error outcome/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY', 'spawn-error', null, null, null), signal: 'SIGTERM' }] }, {}, /signal must be null for a spawn-error outcome/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY', 'spawn-error', null, null, null), spawnError: null }] }, {}, /spawnError is required/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), startedAt: '2026-08-16T00:00:02.000Z', finishedAt: '2026-08-16T00:00:01.000Z' }] }, {}, /timestamps are invalid/u);
  assertProblems({ ...baseReceipt(), executions: [validExec('VERIFY'), { ...validExec('VERIFY', 'exit', 0, null, null), startedAt: '2026-08-15T00:00:00.000Z', finishedAt: '2026-08-15T00:00:01.000Z' }] }, {}, /starts before the previous phase finished/u);
  assertProblems({ ...baseReceipt(), executions: [{ ...validExec('VERIFY'), stdoutDigest: '0'.repeat(10) }] }, {}, /output digests must be sha256/u);
  assertProblems({ ...tddReceipt, executions: [validExec('RED', 'exit', 0, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'), validExec('GREEN', 'exit', 0, null, null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z'), validExec('REFACTOR', 'exit', 0, null, null, '2026-08-16T00:00:04.000Z', '2026-08-16T00:00:05.000Z')] }, { root, expectedChangeId: changeId, expectedTaskId: taskId, expectedStrategy: 'tdd', expectedAgent: 'matrix-impl', expectedInputDigests: tddReceipt.inputDigests, requireTrusted: true }, /RED execution must be a real nonzero process exit/u);
  assertProblems({ ...regressionReceipt, executions: [validExec('REPRODUCE', 'exit', 0, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'), validExec('VERIFY', 'exit', 0, null, null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z')] }, { root, expectedChangeId: changeId, expectedTaskId: taskId, expectedStrategy: 'regression', expectedAgent: 'matrix-impl', expectedInputDigests: regressionReceipt.inputDigests, requireTrusted: true }, /REPRODUCE execution must be a real nonzero process exit/u);
  assertProblems({ ...tddReceipt, executions: [validExec('RED', 'exit', 1, null, null, '2026-08-16T00:00:00.000Z', '2026-08-16T00:00:01.000Z'), validExec('GREEN', 'signal', null, 'SIGTERM', null, '2026-08-16T00:00:02.000Z', '2026-08-16T00:00:03.000Z'), validExec('REFACTOR', 'exit', 0, null, null, '2026-08-16T00:00:04.000Z', '2026-08-16T00:00:05.000Z')] }, { root, expectedChangeId: changeId, expectedTaskId: taskId, expectedStrategy: 'tdd', expectedAgent: 'matrix-impl', expectedInputDigests: tddReceipt.inputDigests, requireTrusted: true }, /GREEN execution must pass with a real zero process exit/u);
  assertProblems({ ...baseReceipt(), executions: [validExec('VERIFY')], completedAt: undefined }, { allowIncomplete: false }, /completedAt must be an ISO timestamp/u);
  assertProblems({ ...baseReceipt(), executions: [validExec('VERIFY')], completedAt: 'not-a-date' }, { allowIncomplete: false }, /completedAt must be an ISO timestamp/u);
  assertProblems({ ...tddReceipt, executions: tddReceipt.executions.slice(0, 2), completedAt: '2026-08-16T00:00:01.000Z' }, { allowIncomplete: true }, /completedAt is forbidden for an incomplete receipt/u);
  assertProblems({ ...baseReceipt(), provenance: 'tdd-run' }, { requireTrusted: true }, /trusted receipt provenance must be runtime-runner/u);
  assertProblems({ ...baseReceipt(), strategyRationale: 'Branch matrix direct execution.', agent: { id: 'other', type: 'enterprise-harness:implementer' } }, { expectedAgent: 'matrix-impl' }, /agent id does not match the bound executor/u);
  assertProblems({ ...baseReceipt(), executionStrategy: 'unknown' }, { expectedStrategy: 'tdd' }, /executionStrategy must be tdd/u);
  assertProblems({ ...baseReceipt(), changeId: 'other' }, { expectedChangeId: changeId }, /changeId must be receipt-validator/u);
  assertProblems({ ...baseReceipt(), taskId: 'other' }, { expectedTaskId: taskId }, /taskId must be task-1/u);
  assert.deepEqual(validateTaskExecutionReceipt(directReceipt, { root, expectedChangeId: changeId, expectedTaskId: taskId, expectedStrategy: 'direct', expectedAgent: 'matrix-impl', expectedInputDigests: { [path.join('harness', 'changes', changeId, 'tasks.md')]: tasksDigest }, requireTrusted: true }), []);

  fs.writeFileSync(taskCommandsPath, '{invalid', 'utf-8');
  assert.match(validateTaskExecutionReceipt(baseReceipt(), { root, expectedChangeId: changeId, expectedTaskId: taskId, expectedStrategy: 'direct', expectedAgent: 'matrix-impl', requireTrusted: true }).join('; '), /task command freeze is unreadable/u);
  fs.writeFileSync(taskCommandsPath, JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [taskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'Branch matrix direct execution.',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
  }, null, 2) + '\n');
  fs.writeFileSync(receiptPath, '{invalid');
  assert.equal(readTaskExecutionReceipt(root, changeId, taskId, {
    root,
    expectedChangeId: changeId,
    expectedTaskId: taskId,
    expectedStrategy: 'direct',
    expectedAgent: 'matrix-impl',
    requireTrusted: true,
    requireFreshInputs: true,
  }).ok, false);
  fs.writeFileSync(receiptPath, `${JSON.stringify(directReceipt, null, 2)}\n`);


  fs.writeFileSync(tasksPath, '# Tasks\nupdated\n', 'utf-8');
  assert.match(readTaskExecutionReceipt(root, changeId, taskId, {
    root,
    expectedChangeId: changeId,
    expectedTaskId: taskId,
    expectedStrategy: 'direct',
    expectedAgent: 'matrix-impl',
    requireTrusted: true,
    requireFreshInputs: true,
  }).problems.join('; '), /task input digest is stale|receipt input digests do not exactly match/u);

  console.log(`PASS task-execution-receipt-matrix ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
