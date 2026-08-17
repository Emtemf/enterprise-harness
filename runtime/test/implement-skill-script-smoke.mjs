import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { taskExecutionReceiptSpoolPath } from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalize = path.join(sourceRoot, 'skills', 'implement', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-implement-skill-'));
const changeId = 'implement-slice';
const receiptRef = `harness/changes/${changeId}/evidence/tasks/task-1.json`;
const designRef = `harness/changes/${changeId}/design.md`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;
const receiptMetadata = {
  provenance: 'runtime-runner',
  agent: { id: 'executor-1', type: 'enterprise-harness:implementer' },
  worktree: {
    path: root,
    gitCommonDir: path.join(root, '.git'),
    headBefore: 'a'.repeat(40),
    headAfter: 'b'.repeat(40),
    treeDigestBefore: 'c'.repeat(64),
    treeDigestAfter: 'd'.repeat(64),
  },
  changedPaths: ['runtime/example.mjs'],
};

try {
  fs.mkdirSync(path.dirname(path.join(root, receiptRef)), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'command-policy.json'), JSON.stringify({
    schemaVersion: 1,
    build: { type: 'command', executables: ['node'] },
  }));
  fs.writeFileSync(path.join(root, `harness/changes/${changeId}/task-commands.json`), JSON.stringify({
    schemaVersion: 3,
    tasks: {
      'task-1': {
        executionStrategy: 'direct',
        strategyRationale: 'This fixture verifies deterministic receipt validation without a failing-test precondition.',
        verifyCommand: ['node', '--test'],
      },
    },
  }));
  fs.writeFileSync(path.join(root, designRef), '# Design\n');
  fs.writeFileSync(path.join(root, tasksRef), '# Tasks\n');
  fs.writeFileSync(path.join(root, receiptRef), JSON.stringify({
    receiptVersion: 2,
    ...receiptMetadata,
    changeId,
    taskId: 'task-1',
    executionStrategy: 'direct',
    strategyRationale: 'This fixture verifies deterministic receipt validation without a failing-test precondition.',
    inputDigests: {
      [designRef]: sha256Artifact(root, designRef),
      [tasksRef]: sha256Artifact(root, tasksRef),
    },
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
    completedAt: '2026-08-16T00:00:00.000Z',
  }, null, 2));
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.task',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [designRef, tasksRef],
    tecpc: { target: 'implement slice', evidence: [receiptRef], context: [receiptRef], path: receiptRef, correction: null },
  });
  const spoolPath = taskExecutionReceiptSpoolPath(root, changeId, 'task-1', handoff.runId);
  fs.mkdirSync(path.dirname(spoolPath), { recursive: true });
  fs.writeFileSync(spoolPath, JSON.stringify({
    spoolVersion: 1,
    runId: handoff.runId,
    statusBaseline: {},
    receipt: JSON.parse(fs.readFileSync(path.join(root, receiptRef), 'utf-8')),
  }));
  const passed = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).status, 'pass');
  const canonicalReceiptText = fs.readFileSync(path.join(root, receiptRef), 'utf-8');
  const otherRunId = `run_${'0'.repeat(36)}`;
  fs.writeFileSync(spoolPath, JSON.stringify({
    spoolVersion: 1,
    runId: otherRunId,
    statusBaseline: {},
    receipt: JSON.parse(canonicalReceiptText),
  }));
  const wrongRun = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(wrongRun.status, 0, 'canonical receipt must be bound to the current execute run');
  fs.writeFileSync(spoolPath, JSON.stringify({
    spoolVersion: 1,
    runId: handoff.runId,
    statusBaseline: {},
    receipt: JSON.parse(canonicalReceiptText),
  }));

  fs.renameSync(path.join(root, receiptRef), path.join(root, `harness/changes/${changeId}/evidence/tasks/alias.json`));
  const aliasOnly = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(aliasOnly.status, 0, 'finalize must require the canonical task receipt path');
  fs.renameSync(path.join(root, `harness/changes/${changeId}/evidence/tasks/alias.json`), path.join(root, receiptRef));

  const legacyArgs = spawnSync(process.execPath, [finalize, changeId, handoff.runId, receiptRef], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(legacyArgs.status, 0, 'legacy arbitrary receipt-path interface must be rejected');

  for (const unsafeTaskId of ['../task-1', 'task\\one']) {
    const unsafe = spawnSync(process.execPath, [finalize, changeId, unsafeTaskId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
    assert.notEqual(unsafe.status, 0, `unsafe task id must be rejected: ${unsafeTaskId}`);
  }

  const mismatchedReceipt = JSON.parse(canonicalReceiptText);
  fs.writeFileSync(path.join(root, receiptRef), JSON.stringify({
    ...mismatchedReceipt,
    taskId: 'other-task',
  }));
  const mismatchedTask = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(mismatchedTask.status, 0, 'canonical receipt content must match the requested task');
  fs.writeFileSync(path.join(root, receiptRef), canonicalReceiptText);

  if (process.platform !== 'win32') {
    const receiptAbsolute = path.join(root, receiptRef);
    const backing = `${receiptAbsolute}.backing`;
    fs.renameSync(receiptAbsolute, backing);
    fs.symlinkSync(path.basename(backing), receiptAbsolute);
    const symlinked = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
    assert.notEqual(symlinked.status, 0, 'canonical receipt path must reject symbolic links');
    fs.rmSync(receiptAbsolute);
    fs.renameSync(backing, receiptAbsolute);

    const spoolBacking = `${spoolPath}.backing`;
    fs.renameSync(spoolPath, spoolBacking);
    fs.symlinkSync(path.basename(spoolBacking), spoolPath);
    const symlinkedSpool = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
    assert.notEqual(symlinkedSpool.status, 0, 'receipt spool path must reject symbolic links');
    fs.rmSync(spoolPath);
    fs.renameSync(spoolBacking, spoolPath);
  }

  fs.writeFileSync(path.join(root, receiptRef), JSON.stringify({
    receiptVersion: 2,
    ...receiptMetadata,
    changeId,
    taskId: 'task-1',
    executionStrategy: 'tdd',
    inputDigests: {
      [designRef]: sha256Artifact(root, designRef),
      [tasksRef]: sha256Artifact(root, tasksRef),
    },
    executions: [
      { phase: 'RED', argv: ['node', '--test'], exitCode: 0 },
      { phase: 'GREEN', argv: ['node', '--test'], exitCode: 0 },
      { phase: 'REFACTOR', argv: ['node', '--test'], exitCode: 0 },
    ],
    completedAt: '2026-08-16T00:00:00.000Z',
  }));
  const falseRed = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(falseRed.status, 0, 'TDD receipt must prove a failing RED execution');

  fs.writeFileSync(path.join(root, receiptRef), JSON.stringify({ changeId, taskId: 'task-1', executions: [{ exitCode: 1 }] }));
  const rejected = spawnSync(process.execPath, [finalize, changeId, 'task-1', handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(rejected.status, 0, 'failed receipt must not finalize');

  console.log(`PASS implement-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
