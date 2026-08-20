import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { taskExecutionReceiptPath, taskExecutionReceiptSpoolPath } from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(sourceRoot, 'runtime', 'task-run.mjs');
const sourceChild = path.join(sourceRoot, 'runtime', 'task-child.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-run-guards-'));
const changeId = 'task-run-guards';
const taskId = 'task-guard';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const agentId = 'guard-impl';
const runId = 'run_12345678-1234-4123-8123-123456789abc';

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

function makeHandoff() {
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [taskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'Guard smoke direct execution',
        verifyCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
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

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n');
  fs.mkdirSync(path.join(root, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runtime', 'task-child.mjs'), fs.readFileSync(sourceChild, 'utf-8'));

  const help = run(process.execPath, [runner, '--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: node runtime\/task-run\.mjs/u);

  const missingArgs = run(process.execPath, [runner]);
  assert.equal(missingArgs.status, 2);
  assert.match(`${missingArgs.stdout}\n${missingArgs.stderr}`, /usage: task-run/u);

  const direct = makeHandoff();
  const externalArgv = run(process.execPath, [runner, changeId, taskId, direct.runId, 'verify', '--', 'node', '-e', 'process.exit(0)']);
  assert.equal(externalArgv.status, 2);
  assert.match(`${externalArgv.stdout}\n${externalArgv.stderr}`, /external child argv|forbidden/u);

  fs.rmSync(path.join(changeDir, 'state.json'));
  const missingState = makeHandoff();
  fs.rmSync(path.join(changeDir, 'state.json'));
  const missingStateResult = run(process.execPath, [runner, changeId, taskId, missingState.runId, 'verify']);
  assert.equal(missingStateResult.status, 2);
  assert.match(`${missingStateResult.stdout}\n${missingStateResult.stderr}`, /state\.json is missing/u);

  const wrongSchema = makeHandoff();
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 5,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
  }, null, 2)}\n`, 'utf-8');
  const wrongSchemaResult = run(process.execPath, [runner, changeId, taskId, wrongSchema.runId, 'verify']);
  assert.equal(wrongSchemaResult.status, 2);
  assert.match(`${wrongSchemaResult.stdout}\n${wrongSchemaResult.stderr}`, /State v6|task-run only accepts State v6/u);

  const wrongStage = makeHandoff();
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    currentTask: taskId,
  }, null, 2)}\n`, 'utf-8');
  const wrongStageResult = run(process.execPath, [runner, changeId, taskId, wrongStage.runId, 'verify']);
  assert.equal(wrongStageResult.status, 2);
  assert.match(`${wrongStageResult.stdout}\n${wrongStageResult.stderr}`, /stage must be implement/u);

  const wrongCurrentTask = makeHandoff();
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: 'other-task',
  }, null, 2)}\n`, 'utf-8');
  const wrongCurrentTaskResult = run(process.execPath, [runner, changeId, taskId, wrongCurrentTask.runId, 'verify']);
  assert.equal(wrongCurrentTaskResult.status, 2);
  assert.match(`${wrongCurrentTaskResult.stdout}\n${wrongCurrentTaskResult.stderr}`, /currentTask must be task-guard/u);

  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
  }, null, 2)}\n`, 'utf-8');
  const normal = run(process.execPath, [runner, changeId, taskId, direct.runId, 'verify']);
  assert.equal(normal.status, 2);
  assert.match(`${normal.stdout}\n${normal.stderr}`, /task child wrapper failed to launch|task command spawn failed|terminated without an exit status|implementer binding does not match the execute handoff run/u);

  console.log(`PASS task-run-guards ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
