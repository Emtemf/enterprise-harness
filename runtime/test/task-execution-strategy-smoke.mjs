import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  executionReceiptPath,
  loadTaskExecutionStrategy,
  readTaskExecutionReceipt,
  validateTaskExecutionReceipt,
} from '../lib/task-execution.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-execution-strategy-'));
const changeId = 'mixed-strategy';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const digest = createHash('sha256').update('fixture').digest('hex');

function receipt(taskId, strategy, executions) {
  return {
    receiptVersion: 1,
    provenance: 'task-execution',
    changeId,
    taskId,
    strategy,
    agent: { id: 'implementer-1', type: 'enterprise-harness:implementer' },
    executions,
  };
}

function execution(phase, exitCode = 0) {
  return {
    phase,
    argv: ['node', '-e', 'process.exit(0)'],
    exitCode,
    startedAt: '2026-08-13T00:00:00.000Z',
    finishedAt: '2026-08-13T00:00:01.000Z',
    stdoutDigest: digest,
    stderrDigest: digest,
  };
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      'task-direct': { executionStrategy: 'direct', verifyCommand: ['node', '-e', 'process.exit(0)'] },
      'task-tdd': { executionStrategy: 'tdd', redCommand: ['node', '-e', 'process.exit(1)'] },
      'task-migration': { executionStrategy: 'migration', verifyCommand: ['node', '-e', 'process.exit(0)'] },
    },
  }, null, 2)}\n`);

  assert.equal(loadTaskExecutionStrategy(root, changeId, 'task-direct').strategy, 'direct');
  assert.equal(loadTaskExecutionStrategy(root, changeId, 'task-tdd').strategy, 'tdd');
  assert.equal(loadTaskExecutionStrategy(root, changeId, 'task-migration').strategy, 'migration');

  assert.deepEqual(validateTaskExecutionReceipt(
    receipt('task-direct', 'direct', [execution('VERIFY')]),
    { changeId, taskId: 'task-direct', strategy: 'direct', requireComplete: true },
  ), []);
  assert.deepEqual(validateTaskExecutionReceipt(
    receipt('task-tdd', 'tdd', [execution('GREEN')]),
    { changeId, taskId: 'task-tdd', strategy: 'tdd' },
  ), ['tdd requires RED evidence']);
  assert.match(
    validateTaskExecutionReceipt(
      receipt('task-migration', 'migration', [execution('DRY_RUN'), execution('APPLY')]),
      { changeId, taskId: 'task-migration', strategy: 'migration', requireComplete: true },
    ).join('\n'),
    /migration completion requires ROLLBACK/,
  );

  const directPath = executionReceiptPath(root, changeId, 'task-direct');
  fs.mkdirSync(path.dirname(directPath), { recursive: true });
  fs.writeFileSync(directPath, `${JSON.stringify(receipt('task-direct', 'direct', [execution('VERIFY')]), null, 2)}\n`);
  assert.equal(readTaskExecutionReceipt(root, changeId, 'task-direct', 'direct').ok, true);

  console.log('PASS task-execution-strategy verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
