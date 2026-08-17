import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact, validateCompletionProof } from '../lib/result-contract.mjs';
import { resolveStageCompletionProof } from '../lib/stage-results.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-implement-task-proof-'));
const changeId = 'implement-all-tasks';
const tasksRef = `harness/changes/${changeId}/tasks.md`;
const designRef = `harness/changes/${changeId}/design.md`;
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

function writeJson(ref, value) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function addTaskProof(taskId) {
  const receiptRef = `harness/changes/${changeId}/evidence/tasks/${taskId}.json`;
  writeJson(receiptRef, {
    receiptVersion: 2,
    ...receiptMetadata,
    changeId,
    taskId,
    executionStrategy: 'direct',
    strategyRationale: 'The fixture models an independently verifiable direct task.',
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
  });
  const tecpc = {
    target: `complete ${taskId}`,
    evidence: [receiptRef],
    context: [tasksRef, designRef],
    path: `${tasksRef} -> ${receiptRef}`,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.task',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [tasksRef, designRef],
    tecpc,
  });
  const artifacts = [{ path: receiptRef, digest: sha256Artifact(root, receiptRef) }];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'implement',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:implementer', skill: 'implement' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts,
    assertions: [{ id: 'task-receipt', verdict: 'pass', evidence: [receiptRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [receiptRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-16T00:00:01.000Z',
  };
  writeJson(path.relative(root, v2ResultPath(root, changeId, execute.runId)), result);
  const check = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'review.task',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [receiptRef],
    tecpc,
  });
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'implement',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: artifacts,
    rubricIds: [...check.input.rubricIds],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-16T00:00:02.000Z',
  };
  writeJson(path.relative(root, v2ResultPath(root, changeId, check.runId, 'check')), review);
  appendCompletedHandoffBinding(root, changeId, execute.input, {
    agentId: receiptMetadata.agent.id,
  });
  appendCompletedHandoffBinding(root, changeId, check.input, {
    agentId: `${taskId}-reviewer`,
  });
  return { executeRunId: execute.runId, reviewRunId: check.runId, receiptRef };
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'command-policy.json'), JSON.stringify({
    schemaVersion: 1,
    build: { type: 'command', executables: ['node'] },
  }));
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, `harness/changes/${changeId}/task-commands.json`), JSON.stringify({
    schemaVersion: 3,
    tasks: {
      'task-one': {
        executionStrategy: 'direct',
        strategyRationale: 'The fixture models an independently verifiable direct task.',
        verifyCommand: ['node', '--test'],
      },
      'task-two': {
        executionStrategy: 'direct',
        strategyRationale: 'The fixture models an independently verifiable direct task.',
        verifyCommand: ['node', '--test'],
      },
    },
  }));
  fs.mkdirSync(path.dirname(path.join(root, tasksRef)), { recursive: true });
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## D1\n');
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks',
    '',
    '## Task 1: task-one — first outcome',
    '',
    '## Task 2: task-two — second outcome',
    '',
  ].join('\n'));

  addTaskProof('task-one');
  const incomplete = resolveStageCompletionProof(root, changeId, 'implement');
  assert.equal(incomplete.proof, null);
  assert.match(incomplete.problems.join('; '), /task-two/u);

  addTaskProof('task-two');
  const complete = resolveStageCompletionProof(root, changeId, 'implement');
  assert.ok(complete.proof, complete.problems.join('; '));
  assert.equal(complete.proof.stage, 'implement');
  assert.deepEqual(complete.proof.taskProofs.map((proof) => proof.taskId), ['task-one', 'task-two']);
  assert.deepEqual(validateCompletionProof(root, complete.proof), []);

  fs.writeFileSync(path.join(root, tasksRef), fs.readFileSync(path.join(root, tasksRef), 'utf-8').replace('task-two', 'task-renamed'));
  const stale = resolveStageCompletionProof(root, changeId, 'implement');
  assert.equal(stale.proof, null);
  assert.match(stale.problems.join('; '), /stale|task-renamed/u);

  console.log(`PASS implement-task-completion ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
