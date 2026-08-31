import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import {
  taskExecutionReceiptPath,
  validateTaskExecutionReceipt,
} from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const runner = path.join(sourceRoot, 'runtime', 'task-run.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-write-scope-'));
const changeId = 'write-scope';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const agentId = 'write-scope-implementer';

function runTask(taskId, runId, phase) {
  return spawnSync(process.execPath, [runner, changeId, taskId, runId, phase], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_SESSION_ID: '',
      CLAUDE_SESSION_ID: '',
      HARNESS_IMPLEMENTER_ID: agentId,
    },
  });
}

function createExecuteHandoff(taskId) {
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
  }, null, 2)}\n`);
  const created = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: `execute-${taskId}`,
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [
      `harness/changes/${changeId}/state.json`,
      `harness/changes/${changeId}/tasks.md`,
      `harness/changes/${changeId}/task-commands.json`,
    ],
    tecpc: { target: `execute ${taskId}`, evidence: [], context: [], path: taskId, correction: null },
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
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  assert.equal(spawnSync('git', ['config', 'user.email', 'scope@example.test'], { cwd: root, shell: false }).status, 0);
  assert.equal(spawnSync('git', ['config', 'user.name', 'Scope Fixture'], { cwd: root, shell: false }).status, 0);
  fs.writeFileSync(path.join(root, '.gitignore'), 'harness/\n');
  assert.equal(spawnSync('git', ['add', '.gitignore'], { cwd: root, shell: false }).status, 0);
  assert.equal(spawnSync('git', ['commit', '-qm', 'baseline'], { cwd: root, shell: false }).status, 0);
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n');
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 4,
    tasks: {
      allowed: {
        executionStrategy: 'direct',
        strategyRationale: 'The allowed file is the complete task output.',
        writeScope: { allowed: ['allowed.txt'], forbidden: [] },
        commands: [{ phase: 'VERIFY', argv: ['node', '-e', "require('node:fs').writeFileSync('allowed.txt', 'ok')"] }],
      },
      forbidden: {
        executionStrategy: 'direct',
        strategyRationale: 'The task intentionally exercises a scope violation.',
        writeScope: { allowed: ['allowed.txt'], forbidden: ['forbidden.txt'] },
        commands: [{ phase: 'VERIFY', argv: ['node', '-e', "require('node:fs').writeFileSync('forbidden.txt', 'must-not-publish')"] }],
      },
    },
  }, null, 2)}\n`);

  const allowed = createExecuteHandoff('allowed');
  const allowedResult = runTask('allowed', allowed.runId, 'VERIFY');
  assert.equal(allowedResult.status, 0, `${allowedResult.stdout}\n${allowedResult.stderr}`);
  assert.equal(fs.readFileSync(path.join(root, 'allowed.txt'), 'utf-8'), 'ok');
  assert.ok(fs.existsSync(taskExecutionReceiptPath(root, changeId, 'allowed')));
  const forged = JSON.parse(fs.readFileSync(taskExecutionReceiptPath(root, changeId, 'allowed'), 'utf-8'));
  forged.changedPaths = ['forbidden.txt'];
  assert.match(
    validateTaskExecutionReceipt(forged, {
      root,
      expectedChangeId: changeId,
      expectedTaskId: 'allowed',
      expectedAgent: agentId,
      requireTrusted: true,
    }).join('; '),
    /write scope/u,
    'receipt validation must re-check schema v4 write scope',
  );

  const forbidden = createExecuteHandoff('forbidden');
  const forbiddenResult = runTask('forbidden', forbidden.runId, 'VERIFY');
  assert.notEqual(forbiddenResult.status, 0, 'scope violation must fail closed');
  assert.match(`${forbiddenResult.stdout}\n${forbiddenResult.stderr}`, /write scope|outside.*scope|forbidden/u);
  assert.ok(fs.existsSync(path.join(root, 'forbidden.txt')), 'the runner cannot roll back a child side effect');
  assert.equal(
    fs.existsSync(taskExecutionReceiptPath(root, changeId, 'forbidden')),
    false,
    'scope violation must not publish a canonical receipt',
  );
  console.log(`PASS task-write-scope ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
