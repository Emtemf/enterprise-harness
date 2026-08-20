import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readTaskExecutionReceipt,
  taskExecutionReceiptPath,
  validateTaskExecutionReceipt,
} from '../lib/task-execution-receipt.mjs';
import { validateTaskExecutionEvidence } from '../lib/execution-prerequisites.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-authority-'));
const changeId = 'task-authority';
const taskId = 'task-direct';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const inputRef = `harness/changes/${changeId}/tasks.md`;
const digest = createHash('sha256').update('# Tasks\n').digest('hex');
const outputDigest = createHash('sha256').update('').digest('hex');
const gitId = 'a'.repeat(40);

function canonicalReceipt(overrides = {}) {
  return {
    receiptVersion: 2,
    provenance: 'runtime-runner',
    changeId,
    taskId,
    executionStrategy: 'direct',
    strategyRationale: 'The frozen task only requires deterministic verification.',
    agent: { id: 'implementer-1', type: 'enterprise-harness:implementer' },
    worktree: {
      path: root,
      gitCommonDir: path.join(root, '.git'),
      headBefore: gitId,
      headAfter: gitId,
      treeDigestBefore: outputDigest,
      treeDigestAfter: outputDigest,
    },
    changedPaths: ['src/main/java/example/App.java'],
    outputSnapshot: {
      'src/main/java/example/App.java': { state: 'file', digest: outputDigest },
    },
    inputDigests: { [inputRef]: digest },
    executions: [{
      phase: 'VERIFY',
      argv: ['node', '-e', 'process.exit(0)'],
      outcome: 'exit',
      exitCode: 0,
      signal: null,
      spawnError: null,
      startedAt: '2026-08-16T00:00:00.000Z',
      finishedAt: '2026-08-16T00:00:01.000Z',
      stdoutDigest: outputDigest,
      stderrDigest: outputDigest,
    }],
    completedAt: '2026-08-16T00:00:01.000Z',
    ...overrides,
  };
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n');
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [taskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'The frozen task only requires deterministic verification.',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
  }, null, 2)}\n`);

  const receiptPath = taskExecutionReceiptPath(root, changeId, taskId);
  assert.equal(
    path.relative(root, receiptPath).replaceAll('\\', '/'),
    `harness/changes/${changeId}/evidence/tasks/${taskId}.json`,
  );
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(canonicalReceipt(), null, 2)}\n`);

  const loaded = readTaskExecutionReceipt(root, changeId, taskId, {
    expectedStrategy: 'direct',
    expectedAgent: 'implementer-1',
    requireTrusted: true,
    requireFreshInputs: true,
  });
  assert.equal(loaded.ok, true, loaded.problems.join('; '));
  assert.deepEqual(
    validateTaskExecutionEvidence(root, changeId, { currentTask: taskId }, 'implementer-1'),
    [],
    'the explicit task evidence check must consume the canonical receipt',
  );

  const legacyShape = {
    receiptVersion: 1,
    provenance: 'task-execution',
    changeId,
    taskId,
    strategy: 'direct',
    agent: { id: 'implementer-1', type: 'enterprise-harness:implementer' },
    executions: canonicalReceipt().executions,
  };
  assert.match(
    validateTaskExecutionReceipt(legacyShape, { root, requireTrusted: true }).join('; '),
    /unknown property strategy|invalid executionStrategy|trusted receipt provenance/u,
  );
  assert.match(
    validateTaskExecutionReceipt(canonicalReceipt({
      provenance: 'tdd-run',
      agent: { id: 'legacy-1', type: 'enterprise-harness:tdd-executor' },
    }), { root, requireTrusted: true }).join('; '),
    /enterprise-harness:implementer|runtime-runner/u,
    'legacy TDD receipts must not be accepted as v6 task authority',
  );

  const legacyPath = path.join(changeDir, 'evidence', 'execution', `${taskId}.json`);
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.writeFileSync(legacyPath, `${JSON.stringify(legacyShape, null, 2)}\n`);
  fs.rmSync(receiptPath);
  const noFallback = readTaskExecutionReceipt(root, changeId, taskId, {
    requireTrusted: true,
  });
  assert.equal(noFallback.ok, false);
  assert.match(noFallback.problems.join('; '), /missing/u);

  console.log(`PASS task-execution-authority ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
