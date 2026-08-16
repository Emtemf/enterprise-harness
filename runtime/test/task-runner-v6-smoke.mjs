import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import {
  readTaskExecutionReceipt,
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
} from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const runner = path.join(sourceRoot, 'runtime', 'task-run.mjs');
const legacyTddRunner = path.join(sourceRoot, 'runtime', 'tdd-run.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-runner-v6-'));
const changeId = 'runner-v6';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const agentId = 'implementer-v6';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_SESSION_ID: '',
      CLAUDE_SESSION_ID: '',
      HARNESS_IMPLEMENTER_ID: agentId,
      ...options.env,
    },
  });
}

function mustPass(result, label) {
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

function createExecuteHandoff(taskId) {
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    stage: 'implement',
    currentTask: taskId,
  }, null, 2)}\n`);
  const created = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: `execute-${taskId}`,
    role: 'execute',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [
      `harness/changes/${changeId}/state.json`,
      `harness/changes/${changeId}/tasks.md`,
      `harness/changes/${changeId}/task-commands.json`,
    ],
    tecpc: {
      target: `execute ${taskId}`,
      evidence: [],
      context: [],
      path: `task ${taskId}`,
      correction: null,
    },
  });
  appendAgentEvent(root, changeId, {
    kind: 'dispatch-binding',
    agentId,
    requestedAgentType: 'enterprise-harness:implementer',
    runId: created.runId,
    handoffRole: 'execute',
    handoffPath: created.path,
    cwd: root,
  });
  appendAgentEvent(root, changeId, {
    kind: 'start',
    agentId,
    observedAgentType: 'enterprise-harness:implementer',
    runId: created.runId,
    handoffRole: 'execute',
    handoffPath: created.path,
    cwd: root,
  });
  return created;
}

function taskRun(taskId, runId, phase) {
  return run(process.execPath, [
    runner,
    changeId,
    taskId,
    runId,
    phase,
  ]);
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n');
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      'task-direct': {
        executionStrategy: 'direct',
        strategyRationale: 'A deterministic contract check is sufficient; no behavior change is introduced.',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
      'task-tdd': {
        executionStrategy: 'tdd',
        redCommand: ['node', '-e', 'process.exit(7)'],
        greenCommand: ['node', '-e', 'process.exit(0)'],
        refactorCommand: ['node', '-e', 'process.exit(0)'],
      },
      'task-stale': {
        executionStrategy: 'direct',
        strategyRationale: 'Staleness probe.',
        verifyCommand: ['node', '-e', "require('node:fs').writeFileSync('should-not-run', 'x')"],
      },
    },
  }, null, 2)}\n`);
  mustPass(run('git', ['init', '-q']), 'git init');
  mustPass(run('git', ['config', 'user.email', 'runner@example.test']), 'git email');
  mustPass(run('git', ['config', 'user.name', 'Runner Fixture']), 'git name');
  mustPass(run('git', ['add', '.']), 'git add');
  mustPass(run('git', ['commit', '-qm', 'fixture']), 'git commit');

  const direct = createExecuteHandoff('task-direct');
  const externalArgv = run(process.execPath, [
    runner,
    changeId,
    'task-direct',
    direct.runId,
    'verify',
    '--',
    'node',
    '-e',
    'process.exit(0)',
  ]);
  assert.equal(externalArgv.status, 2);
  assert.match(`${externalArgv.stdout}\n${externalArgv.stderr}`, /external child argv|forbidden/u);
  mustPass(
    taskRun('task-direct', direct.runId, 'verify', ['node', '-e', 'process.exit(0)']),
    'direct VERIFY',
  );
  const directReceipt = readTaskExecutionReceipt(root, changeId, 'task-direct', {
    expectedStrategy: 'direct',
    expectedAgent: agentId,
    expectedInputDigests: direct.input.inputDigests,
    requireTrusted: true,
    requireFreshInputs: true,
  });
  assert.equal(directReceipt.ok, true, directReceipt.problems.join('; '));
  assert.equal(directReceipt.receipt.provenance, 'runtime-runner');
  assert.equal(directReceipt.receipt.agent.type, 'enterprise-harness:implementer');
  assert.equal(
    fs.existsSync(taskExecutionReceiptSpoolPath(root, changeId, 'task-direct', direct.runId)),
    true,
  );

  const repeated = taskRun('task-direct', direct.runId, 'verify', ['node', '-e', 'process.exit(0)']);
  assert.equal(repeated.status, 2, 'a finalized canonical receipt must be immutable');
  assert.match(`${repeated.stdout}\n${repeated.stderr}`, /already exists|already finalized/u);

  const tdd = createExecuteHandoff('task-tdd');
  const red = taskRun('task-tdd', tdd.runId, 'red', ['node', '-e', 'process.exit(7)']);
  assert.equal(red.status, 7, `RED must preserve the child failure status\n${red.stdout}\n${red.stderr}`);
  assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, 'task-tdd')), false);
  mustPass(
    taskRun('task-tdd', tdd.runId, 'green', ['node', '-e', 'process.exit(0)']),
    'TDD GREEN',
  );
  mustPass(
    taskRun('task-tdd', tdd.runId, 'refactor', ['node', '-e', 'process.exit(0)']),
    'TDD REFACTOR',
  );
  const tddReceipt = readTaskExecutionReceipt(root, changeId, 'task-tdd', {
    expectedStrategy: 'tdd',
    expectedAgent: agentId,
    expectedInputDigests: tdd.input.inputDigests,
    requireTrusted: true,
    requireFreshInputs: true,
  });
  assert.equal(tddReceipt.ok, true, tddReceipt.problems.join('; '));
  assert.deepEqual(tddReceipt.receipt.executions.map((item) => item.phase), [
    'RED',
    'GREEN',
    'REFACTOR',
  ]);
  const legacyV6 = run(process.execPath, [
    legacyTddRunner,
    changeId,
    'task-tdd',
    'red',
    '--',
    'node',
    '-e',
    'process.exit(7)',
  ]);
  assert.equal(legacyV6.status, 2);
  assert.match(`${legacyV6.stdout}\n${legacyV6.stderr}`, /v5 compatibility-only|State v6 must use task-run/u);

  const stale = createExecuteHandoff('task-stale');
  fs.appendFileSync(path.join(changeDir, 'tasks.md'), '\nchanged after handoff\n');
  const staleResult = taskRun(
    'task-stale',
    stale.runId,
    'verify',
    ['node', '-e', "require('node:fs').writeFileSync('should-not-run', 'x')"],
  );
  assert.equal(staleResult.status, 2);
  assert.match(`${staleResult.stdout}\n${staleResult.stderr}`, /stale/u);
  assert.equal(fs.existsSync(path.join(root, 'should-not-run')), false, 'stale input must block before spawning');

  console.log(`PASS task-runner-v6 ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
