import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { taskExecutionReceiptPath, taskExecutionReceiptSpoolPath } from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-implement-finalize-'));
const changeId = 'implement-finalize-probe';
const taskId = 'task-1';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;
const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
const script = path.join(sourceRoot, 'skills', 'implement', 'scripts', 'finalize-result.mjs');

function runFinalize(runId) {
  return spawnSync(process.execPath, [script, changeId, taskId, runId], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
}

try {
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId, 'evidence', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- Implement finalization\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n- Finalize from canonical receipt\n');
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks',
    '',
    '## Task 1: task-1',
    '### Target and scope',
    '- Finalize the implement stage from the canonical receipt.',
    '### Frozen inputs',
    '- Consumes: design.md',
    '### Execution strategy',
    '- Strategy: `direct`',
    '### Commands and verification',
    '- Frozen primary argv: `node -e "process.exit(0)"`',
    '- Acceptance checks: receipt exists and is canonical',
    '- Recovery/rollback: revert the change',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'harness', 'changes', changeId, 'task-commands.json'), JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [taskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'Implementing finalization from canonical receipts needs a deterministic direct strategy.',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
  }, null, 2) + '\n');
  fs.writeFileSync(statePath, JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2));

  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.execute-task',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [designRef],
    tecpc: {
      target: 'canonical receipt finalization',
      evidence: [designRef],
      context: [requirementsRef],
      path: tasksRef,
      correction: null,
    },
  });

  const receipt = {
    receiptVersion: 2,
    provenance: 'runtime-runner',
    changeId,
    taskId,
    executionStrategy: 'direct',
    strategyRationale: 'Implementing finalization from canonical receipts needs a deterministic direct strategy.',
    agent: { id: 'implementer-1', type: 'enterprise-harness:implementer' },
    worktree: {
      path: root,
      gitCommonDir: path.join(root, '.git'),
      headBefore: 'a'.repeat(40),
      headAfter: 'b'.repeat(40),
      treeDigestBefore: 'c'.repeat(64),
      treeDigestAfter: 'd'.repeat(64),
    },
    changedPaths: ['src/main/java/example/App.java'],
    outputSnapshot: {
      'src/main/java/example/App.java': { state: 'file', digest: '0'.repeat(64) },
    },
    inputDigests: { [designRef]: sha256Artifact(root, designRef) },
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
  const spoolPath = taskExecutionReceiptSpoolPath(root, changeId, taskId, handoff.runId);
  fs.mkdirSync(path.dirname(spoolPath), { recursive: true });
  fs.writeFileSync(spoolPath, JSON.stringify({ spoolVersion: 1, runId: handoff.runId, receipt }, null, 2) + '\n');
  const canonicalPath = taskExecutionReceiptPath(root, changeId, taskId);
  fs.writeFileSync(canonicalPath, JSON.stringify(receipt, null, 2) + '\n');

  const ok = runFinalize(handoff.runId);
  assert.equal(ok.status, 0, ok.stderr);
  const result = JSON.parse(ok.stdout);
  assert.equal(result.stage, 'implement');
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.inputDigests, handoff.input.inputDigests);

  fs.rmSync(canonicalPath);
  const missingCanonical = runFinalize(handoff.runId);
  assert.notEqual(missingCanonical.status, 0);
  assert.match(missingCanonical.stderr, /missing canonical receipt/u);

  console.log(`PASS implement-finalize-canonical ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
