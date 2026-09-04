import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createHandoffV2,
  persistHandoffV2Result,
  v2ResultPath,
} from '../core/handoff-v2.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { captureWorktreeBaseline } from '../lib/git-evidence.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { resolveStageCompletionProof } from '../lib/stage-results.mjs';
import { bindSession } from '../lib/sessions.mjs';
import { taskExecutionReceiptPath } from '../lib/task-execution-receipt.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const runner = path.join(sourceRoot, 'runtime', 'task-run.mjs');
const finalizer = path.join(sourceRoot, 'skills', 'implement', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-worktree-integration-'));
const worker = path.join(root, '.worker');
const changeId = 'worktree-integration';
const taskId = 'task-one';
const agentId = 'implementer-worktree';
const base = `harness/changes/${changeId}`;
const stateRef = `${base}/state.json`;
const tasksRef = `${base}/tasks.md`;
const commandsRef = `${base}/task-commands.json`;
const productRef = 'src/main/java/demo/App.java';
const testRef = 'src/test/java/demo/AppTest.java';
const receiptRef = `${base}/evidence/tasks/${taskId}.json`;

function run(command, args, cwd = root, env = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_SESSION_ID: '',
      CLAUDE_SESSION_ID: '',
      HARNESS_IMPLEMENTER_ID: agentId,
      ...env,
    },
  });
}

function write(relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

try {
  assert.equal(run('git', ['init', '-q']).status, 0);
  assert.equal(run('git', ['config', 'user.email', 'worktree@example.test']).status, 0);
  assert.equal(run('git', ['config', 'user.name', 'Worktree Fixture']).status, 0);
  write('harness/ACTIVE_CHANGE', `${changeId}\n`);
  write(stateRef, `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
  }, null, 2)}\n`);
  write(tasksRef, '# Tasks\n\n## Task 1: task-one\n');
  write(productRef, 'package demo; public final class App { public int value() { return 0; } }\n');
  write('scripts/implement-task.mjs', [
    "import fs from 'node:fs';",
    `fs.writeFileSync(${JSON.stringify(productRef)}, 'package demo; public final class App { public int value() { return 1; } }\\n');`,
    '',
  ].join('\n'));
  write(commandsRef, `${JSON.stringify({
    schemaVersion: 4,
    tasks: {
      [taskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'This deterministic fixture isolates worktree receipt projection and reviewed-content integration.',
        testCases: ['TC1'],
        minimalRedCase: null,
        writeScope: { allowed: [productRef, testRef], forbidden: ['harness/archive/**'] },
        commands: [{ phase: 'VERIFY', argv: ['node', 'scripts/implement-task.mjs'] }],
      },
    },
  }, null, 2)}\n`);
  assert.equal(run('git', ['add', '.']).status, 0);
  assert.equal(run('git', ['commit', '-qm', 'fixture']).status, 0);
  assert.equal(run('git', ['worktree', 'add', '--detach', worker, 'HEAD']).status, 0);

  const execute = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.execute-task',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [stateRef, tasksRef, commandsRef],
    tecpc: {
      target: '在隔离 worktree 完成并集成 task-one',
      evidence: [tasksRef, commandsRef],
      context: [tasksRef],
      path: `${tasksRef} -> ${receiptRef}`,
      correction: null,
    },
  });
  const sessionId = 'worktree-session';
  const toolUseId = 'worktree-dispatch';
  const statusBaseline = captureWorktreeBaseline(worker);
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    subjectRoot: root,
    controllerRevision: 'test',
  });
  for (const event of [
    { kind: 'dispatch', requestedAgentType: 'enterprise-harness:implementer' },
    { kind: 'start', observedAgentType: 'enterprise-harness:implementer' },
  ]) appendAgentEvent(root, changeId, {
    ...event,
    sessionId,
    toolUseId,
    agentId,
    runId: execute.runId,
    behavior: execute.input.behavior,
    handoffRole: 'execute',
    handoffPath: execute.path,
    cwd: worker,
    ...(event.kind === 'start' ? { statusBaseline } : {}),
  });
  const workerTest = path.join(worker, testRef);
  fs.mkdirSync(path.dirname(workerTest), { recursive: true });
  fs.writeFileSync(workerTest, 'package demo; final class AppTest {}\n');

  const executed = run(process.execPath, [runner, changeId, taskId, execute.runId, 'verify'], worker, {
    ENTERPRISE_HARNESS_SESSION_ID: sessionId,
    HARNESS_IMPLEMENTER_ID: '',
  });
  assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
  const workerReceipt = taskExecutionReceiptPath(worker, changeId, taskId);
  const integrationReceipt = taskExecutionReceiptPath(root, changeId, taskId);
  assert.ok(fs.existsSync(workerReceipt), 'execution worktree must retain its canonical receipt');
  assert.ok(fs.existsSync(integrationReceipt), 'integration checkout must receive the controlled receipt projection');
  assert.equal(fs.readFileSync(workerReceipt, 'utf-8'), fs.readFileSync(integrationReceipt, 'utf-8'));
  assert.deepEqual(JSON.parse(fs.readFileSync(workerReceipt, 'utf-8')).changedPaths,
    [productRef, testRef].sort());
  assert.match(fs.readFileSync(path.join(root, productRef), 'utf-8'), /return 0/u);
  assert.match(fs.readFileSync(path.join(worker, productRef), 'utf-8'), /return 1/u);

  const finalized = run(process.execPath, [finalizer, changeId, taskId, execute.runId], worker);
  assert.equal(finalized.status, 0, finalized.stderr);
  appendAgentEvent(root, changeId, {
    kind: 'stop', sessionId, toolUseId, agentId, runId: execute.runId,
    behavior: execute.input.behavior, handoffRole: 'execute',
    observedAgentType: 'enterprise-harness:implementer',
    handoffPath: v2ResultPath(root, changeId, execute.runId), cwd: worker,
  });
  appendAgentEvent(root, changeId, {
    kind: 'dispatch-binding', sessionId, toolUseId, agentId, runId: execute.runId,
    behavior: execute.input.behavior, handoffRole: 'execute',
    requestedAgentType: 'enterprise-harness:implementer',
    handoffPath: v2ResultPath(root, changeId, execute.runId), cwd: worker,
  });

  const executeResult = JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, execute.runId), 'utf-8'));
  const review = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.review-task',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [tasksRef, commandsRef, receiptRef],
    rubricIds: ['task'],
    tecpc: {
      target: '独立审查 task-one 的 frozen contract、receipt 与 worktree diff',
      evidence: [receiptRef], context: [tasksRef, commandsRef],
      path: `${receiptRef} -> independent task review`, correction: null,
    },
  });
  const reviewResult = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'implement',
    runId: review.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: executeResult.artifacts.map((artifact) => ({ ...artifact })),
    rubricIds: ['task'],
    tecpc: { ...review.input.tecpc },
    verdict: 'pass',
    correction: null,
    reviewedAt: new Date().toISOString(),
  };
  persistHandoffV2Result(root, changeId, review.runId, reviewResult);
  appendCompletedHandoffBinding(root, changeId, review.input, { agentId: 'reviewer-worktree' });

  const beforeIntegration = resolveStageCompletionProof(root, changeId, 'implement');
  assert.equal(beforeIntegration.proof, null, 'reviewed worktree changes must not complete Implement before integration');
  assert.match(beforeIntegration.problems.join('; '), /not integrated|differs from the reviewed worktree/u);

  for (const relative of [productRef, testRef]) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(worker, relative), target);
  }
  const afterIntegration = resolveStageCompletionProof(root, changeId, 'implement');
  assert.ok(afterIntegration.proof, afterIntegration.problems.join('; '));
  assert.deepEqual(afterIntegration.proof.taskProofs.map(({ taskId: id }) => id), [taskId]);
  assert.equal(afterIntegration.proof.artifacts[0].digest, sha256Artifact(root, receiptRef));

  console.log(`PASS task-worktree-integration ${mode}`);
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', worker], { cwd: root, encoding: 'utf-8', shell: false });
  fs.rmSync(root, { recursive: true, force: true });
}
