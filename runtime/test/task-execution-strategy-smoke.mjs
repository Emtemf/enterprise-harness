import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadTaskExecutionStrategy } from '../lib/task-execution.mjs';
import {
  readTaskExecutionReceipt,
  taskExecutionReceiptPath,
} from '../lib/task-execution-receipt.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-execution-strategy-'));
const changeId = 'mixed-strategy';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const digest = 'a'.repeat(64);
const gitId = 'a'.repeat(40);

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      'task-direct': {
        executionStrategy: 'direct',
        strategyRationale: 'verification is sufficient for this task',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
      'task-tdd': { executionStrategy: 'tdd' },
      'task-migration': { executionStrategy: 'migration' },
    },
  }, null, 2)}\n`);

  assert.equal(loadTaskExecutionStrategy(root, changeId, 'task-direct').strategy, 'direct');
  assert.equal(loadTaskExecutionStrategy(root, changeId, 'task-tdd').strategy, 'tdd');
  assert.equal(loadTaskExecutionStrategy(root, changeId, 'task-migration').strategy, 'migration');

  const receiptPath = taskExecutionReceiptPath(root, changeId, 'task-direct');
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify({
    receiptVersion: 1,
    provenance: 'runtime-runner',
    changeId,
    taskId: 'task-direct',
    executionStrategy: 'direct',
    strategyRationale: 'verification is sufficient for this task',
    agent: { id: 'implementer-1', type: 'enterprise-harness:implementer' },
    worktree: {
      path: root,
      gitCommonDir: path.join(root, '.git'),
      headBefore: gitId,
      headAfter: gitId,
      treeDigestBefore: digest,
      treeDigestAfter: digest,
    },
    changedPaths: ['src/main/java/example/App.java'],
    inputDigests: { 'harness/changes/mixed-strategy/task-commands.json': digest },
    executions: [{
      phase: 'VERIFY',
      argv: ['node', '-e', 'process.exit(0)'],
      exitCode: 0,
      startedAt: '2026-08-13T00:00:00.000Z',
      finishedAt: '2026-08-13T00:00:01.000Z',
      stdoutDigest: digest,
      stderrDigest: digest,
    }],
    completedAt: '2026-08-13T00:00:01.000Z',
  }, null, 2)}\n`);
  const loaded = readTaskExecutionReceipt(root, changeId, 'task-direct', {
    expectedStrategy: 'direct',
    requireTrusted: true,
    requireFreshInputs: true,
  });
  assert.equal(loaded.ok, false, 'stale input digest must invalidate a receipt');
  assert.match(loaded.problems.join('; '), /stale|argv/u);

  console.log('PASS task-execution-strategy verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
