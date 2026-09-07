import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { archiveManifestInputRefs, validateArchivedManifest } from '../api/archive.mjs';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { captureWorktreeBaseline } from '../lib/git-evidence.mjs';
import { bindSession } from '../lib/sessions.mjs';
import { taskExecutionReceiptPath } from '../lib/task-execution-receipt.mjs';
import { addClarifyCompletion, prepareClassifiedClarify } from './clarify-readiness-fixture.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { writeCanonicalSingleTaskPlanFixture } from './plan-proof-fixture.mjs';
import { writeCanonicalVerifyCompletionFixture } from './verify-completion-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(sourceRoot, 'runtime', 'cli.mjs');
const implementFinalizer = path.join(sourceRoot, 'skills', 'implement', 'scripts', 'finalize-result.mjs');
const archiveFinalizer = path.join(sourceRoot, 'skills', 'archive', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-main-lifecycle-standard-'));
const worker = path.join(root, '.worker');
const changeId = 'main-lifecycle-standard';
const taskId = 'task-greeting';
const base = `harness/changes/${changeId}`;
const stateRef = `${base}/state.json`;
const productRef = 'src/greeting.mjs';
const testRef = 'test/greeting.test.mjs';
const testArgv = [process.execPath, '--test', testRef];
const routes = [];
const cleanEnv = { ...process.env, ENTERPRISE_HARNESS_SESSION_ID: '', CLAUDE_SESSION_ID: '' };

function run(args, cwd = root, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf-8', shell: false, env: { ...cleanEnv, ...env } });
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
}

function status(expected) {
  const result = run(['workflow', 'status', changeId, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(result.stdout);
  const route = snapshot.clarifyReadiness?.route || snapshot.stageReadiness?.route;
  assert.equal(route, expected, JSON.stringify(snapshot, null, 2));
  assert.equal(snapshot.pendingDecision, null);
  routes.push(route);
  return snapshot;
}

function advance(...args) {
  const result = run(['lifecycle', ...args]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function write(relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

try {
  git('init', '-q');
  git('config', 'user.email', 'lifecycle@example.test');
  git('config', 'user.name', 'Lifecycle Fixture');
  write('CLAUDE.md', '# Standard fixture\n');
  write(productRef, "export function greet(name) { return `Hello, ${name}`; }\n");
  write(testRef, [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { greet } from '../src/greeting.mjs';",
    "test('TC1 中文问候', () => assert.equal(greet('Alice'), '你好，Alice'));",
    '',
  ].join('\n'));

  prepareClassifiedClarify(root, changeId);
  addClarifyCompletion(root, changeId);
  status('transition');
  advance('state', changeId, 'design');

  status('design.produce');
  const design = writeCanonicalCompoundDesignFixture(root, changeId, {
    preserveState: true,
    persistCompoundProof: false,
  });
  status('design.transition');
  advance('state', changeId, 'plan');

  status('plan.produce');
  const plan = writeCanonicalSingleTaskPlanFixture(root, changeId, {
    taskId,
    design,
    persistProof: false,
    stateStage: null,
    tasksContent: [
      '# Tasks', '', `## Task 1: ${taskId}`, '', '- Test cases: TC1', '- Strategy: `tdd`',
      '- Minimal RED case: TC1', '- Write scope: src/greeting.mjs', '',
    ].join('\n'),
    taskCommands: {
      schemaVersion: 4,
      tasks: {
        [taskId]: {
          executionStrategy: 'tdd', strategyRationale: '用户可观察行为变化需要真实 RED。',
          testCases: ['TC1'], minimalRedCase: 'TC1',
          writeScope: { allowed: [productRef], forbidden: ['harness/archive/**'] },
          commands: ['RED', 'GREEN', 'REFACTOR'].map((phase) => ({ phase, argv: testArgv })),
        },
      },
    },
  });
  status('plan.transition');
  advance('current-task', changeId, taskId);
  advance('state', changeId, 'implement');

  status('implement.execute-task');
  git('add', '.');
  git('commit', '-qm', 'standard lifecycle baseline');
  git('worktree', 'add', '--detach', worker, 'HEAD');
  const execute = createHandoffV2(root, {
    changeId, stage: 'implement', behavior: 'implement.execute-task',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [stateRef, plan.tasksRef, plan.commandsRef, plan.planProofRef, plan.designRef, plan.testCasesRef],
    tecpc: { target: 'TDD 实现中文问候', evidence: [plan.planProofRef, plan.testCasesRef], context: [plan.tasksRef, plan.commandsRef], path: `${plan.planProofRef} -> ${taskId}`, correction: null },
  });
  const sessionId = 'main-lifecycle-implement';
  const agentId = 'main-lifecycle-implementer';
  const toolUseId = 'main-lifecycle-dispatch';
  bindSession(root, { sessionId, changeId, worktreePath: root, subjectRoot: root, controllerRevision: 'standard-sample' });
  const common = { sessionId, toolUseId, agentId, runId: execute.runId, behavior: execute.input.behavior, handoffRole: 'execute', handoffPath: execute.path, cwd: worker };
  appendAgentEvent(root, changeId, { ...common, kind: 'dispatch', requestedAgentType: execute.input.agent.type });
  appendAgentEvent(root, changeId, { ...common, kind: 'start', observedAgentType: execute.input.agent.type, statusBaseline: captureWorktreeBaseline(worker) });
  let phase = run(['task-run', changeId, taskId, execute.runId, 'red'], worker, { ENTERPRISE_HARNESS_SESSION_ID: sessionId });
  assert.notEqual(phase.status, 0, 'RED must preserve the real failing test exit');
  fs.writeFileSync(path.join(worker, productRef), "export function greet(name) { return `你好，${name}`; }\n");
  for (const name of ['green', 'refactor']) {
    phase = run(['task-run', changeId, taskId, execute.runId, name], worker, { ENTERPRISE_HARNESS_SESSION_ID: sessionId });
    assert.equal(phase.status, 0, `${phase.stdout}\n${phase.stderr}`);
  }
  const finalized = spawnSync(process.execPath, [implementFinalizer, changeId, taskId, execute.runId], { cwd: worker, encoding: 'utf-8', shell: false, env: cleanEnv });
  assert.equal(finalized.status, 0, finalized.stderr);
  appendAgentEvent(root, changeId, { ...common, kind: 'stop', observedAgentType: execute.input.agent.type, handoffPath: v2ResultPath(root, changeId, execute.runId) });
  appendAgentEvent(root, changeId, { ...common, kind: 'dispatch-binding', requestedAgentType: execute.input.agent.type, handoffPath: v2ResultPath(root, changeId, execute.runId) });
  status('implement.review-task');

  const executeResult = JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, execute.runId), 'utf-8'));
  const receiptRef = path.relative(root, taskExecutionReceiptPath(root, changeId, taskId)).split(path.sep).join('/');
  const review = createHandoffV2(root, {
    changeId, stage: 'implement', behavior: 'implement.review-task', role: 'check', parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [stateRef, plan.tasksRef, plan.commandsRef, receiptRef], rubricIds: ['task'],
    tecpc: { target: '独立审查中文问候实现', evidence: [receiptRef], context: [plan.tasksRef, plan.commandsRef], path: `${receiptRef} -> review`, correction: null },
  });
  persistHandoffV2Result(root, changeId, review.runId, {
    resultVersion: 1, type: 'review-result', changeId, stage: 'implement', runId: review.runId,
    parentRunId: execute.runId, reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId, reviewedArtifacts: executeResult.artifacts,
    rubricIds: [...review.input.rubricIds], tecpc: { ...review.input.tecpc }, verdict: 'pass', correction: null,
    reviewedAt: '2026-09-07T03:00:00.000Z',
  });
  appendCompletedHandoffBinding(root, changeId, review.input, { agentId: 'main-lifecycle-reviewer' });
  status('implement.integrate-task');
  const integrated = run(['task-integrate', changeId, taskId, execute.runId]);
  assert.equal(integrated.status, 0, `${integrated.stdout}\n${integrated.stderr}`);
  status('implement.transition');
  advance('state', changeId, 'verify');

  status('verify.produce');
  const verify = writeCanonicalVerifyCompletionFixture(root, changeId, { preserveUpstream: true, taskId, verifyArgv: testArgv });
  advance('validated', changeId, 'ignored', '2026-09-07T03:01:00.000Z');
  status('verify.transition');
  advance('archive', changeId);

  status('archive.produce');
  const archiveRefs = Object.values(archiveManifestInputRefs(changeId));
  const archiveExecute = createHandoffV2(root, {
    changeId, stage: 'archive', behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' }, inputRefs: archiveRefs,
    tecpc: { target: '封存完整标准样例', evidence: [verify.validationRef, verify.verifyProofRef], context: archiveRefs, path: `${verify.verifyProofRef} -> archive`, correction: null },
  });
  const archiveFinalized = spawnSync(process.execPath, [archiveFinalizer, changeId, archiveExecute.runId], { cwd: root, encoding: 'utf-8', shell: false, env: cleanEnv });
  assert.equal(archiveFinalized.status, 0, archiveFinalized.stderr);
  appendCompletedHandoffBinding(root, changeId, archiveExecute.input, { agentId: 'main-lifecycle-archive-worker' });
  status('archive.review');
  const archiveResult = JSON.parse(archiveFinalized.stdout);
  const archiveReview = createHandoffV2(root, {
    changeId, stage: 'archive', behavior: 'archive.review', role: 'check', parentRunId: archiveExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: archiveResult.artifacts.map(({ path: artifactPath }) => artifactPath),
    tecpc: { ...archiveExecute.input.tecpc },
  });
  persistHandoffV2Result(root, changeId, archiveReview.runId, {
    resultVersion: 1, type: 'review-result', changeId, stage: 'archive', runId: archiveReview.runId,
    parentRunId: archiveExecute.runId, reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: archiveExecute.runId, reviewedArtifacts: archiveResult.artifacts,
    rubricIds: [...archiveReview.input.rubricIds], tecpc: { ...archiveReview.input.tecpc },
    verdict: 'pass', correction: null, reviewedAt: '2026-09-07T03:02:00.000Z',
  });
  appendCompletedHandoffBinding(root, changeId, archiveReview.input, { agentId: 'main-lifecycle-archive-reviewer' });
  status('archive.finalize');
  advance('archive-finalize', changeId);

  assert.equal(fs.existsSync(path.join(root, base)), false);
  assert.deepEqual(validateArchivedManifest(root, changeId), []);
  assert.deepEqual(routes, [
    'transition', 'design.produce', 'design.transition', 'plan.produce', 'plan.transition',
    'implement.execute-task', 'implement.review-task', 'implement.integrate-task', 'implement.transition',
    'verify.produce', 'verify.transition', 'archive.produce', 'archive.review', 'archive.finalize',
  ]);
  console.log(`PASS main-lifecycle-standard-sample ${mode}`);
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', worker], { cwd: root, encoding: 'utf-8', shell: false });
  fs.rmSync(root, { recursive: true, force: true });
}
