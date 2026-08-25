import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent, gitCommonDir } from '../lib/agent-evidence.mjs';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { computeStageGateDigest } from '../lib/execution-prerequisites.mjs';
import { preWrite } from '../lib/hooks/pre-write.mjs';
import {
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
} from '../lib/task-execution-receipt.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(sourceRoot, 'runtime', 'task-run.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-governed-task-run-'));
const rootAlias = `${root}-alias`;
const changeId = 'governed-runner';
const taskId = 'task-one';
const agentId = 'implementer-one';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const stateRef = `harness/changes/${changeId}/state.json`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;
const commandsRef = `harness/changes/${changeId}/task-commands.json`;
const targetRef = 'src/main/java/demo/App.java';

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    cwd: root,
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

function mustPass(result, label) {
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

function cleanPreWrite(input) {
  const previousEnterprise = process.env.ENTERPRISE_HARNESS_SESSION_ID;
  const previousClaude = process.env.CLAUDE_SESSION_ID;
  process.env.ENTERPRISE_HARNESS_SESSION_ID = '';
  process.env.CLAUDE_SESSION_ID = '';
  try {
    return preWrite(input);
  } finally {
    if (previousEnterprise === undefined) delete process.env.ENTERPRISE_HARNESS_SESSION_ID;
    else process.env.ENTERPRISE_HARNESS_SESSION_ID = previousEnterprise;
    if (previousClaude === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = previousClaude;
  }
}

try {
  fs.mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  fs.mkdirSync(changeDir, { recursive: true });
  mustPass(run('git', ['init', '-q']), 'git init');
  mustPass(run('git', ['config', 'user.email', 'runner@example.test']), 'git email');
  mustPass(run('git', ['config', 'user.name', 'Runner Fixture']), 'git name');
  fs.writeFileSync(path.join(root, targetRef), 'class App {}\n');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n');
  fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n');
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n\n## Task 1: task-one\n');
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    decision: { tier: 'L1' },
  });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
    artifacts: { classification },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  const childScript = path.join(root, 'verify-task.mjs');
  fs.writeFileSync(childScript, [
    "import fs from 'node:fs';",
    "const [target] = process.argv.slice(2);",
    "const authorizationPath = process.env.ENTERPRISE_HARNESS_TASK_AUTH;",
    "if (!authorizationPath || !fs.existsSync(authorizationPath)) process.exit(9);",
    "const authorization = JSON.parse(fs.readFileSync(authorizationPath, 'utf-8'));",
    `if (authorization.changeId !== '${changeId}' || authorization.taskId !== '${taskId}') process.exit(8);`,
    "if (process.env.FORCE_TASK_FAILURE === '1') process.exit(7);",
    "fs.writeFileSync(target, 'class App { int value = 1; }\\n');",
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [taskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'The frozen child verifies runner-only governed write authorization.',
        verifyCommand: ['node', childScript, targetRef],
      },
    },
  }, null, 2)}\n`);
  mustPass(run('git', ['add', '.']), 'git add fixture');
  mustPass(run('git', ['commit', '-qm', 'fixture']), 'git commit fixture');
  const bindingCwd = process.platform === 'win32' ? root : rootAlias;
  if (bindingCwd !== root) fs.symlinkSync(root, bindingCwd, 'dir');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  appendAgentEvent(root, changeId, {
    kind: 'codegraph-attempt',
    agentId: 'explorer-one',
    observedAgentType: 'enterprise-harness:code-explore',
    cwd: root,
  });
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'evidence', 'stage-gate.json'), `${JSON.stringify({
    schemaVersion: 1,
    changeId,
    stage: 'implement',
    ok: true,
    validatedAt: '2026-08-17T00:00:00.000Z',
    changeDigest: computeStageGateDigest(root, changeId),
  }, null, 2)}\n`);

  const execute = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.task',
    role: 'execute',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs: [stateRef, tasksRef, commandsRef],
    tecpc: {
      target: `execute ${taskId}`,
      evidence: [],
      context: [tasksRef],
      path: tasksRef,
      correction: null,
    },
  });
  appendAgentEvent(root, changeId, {
    kind: 'dispatch-binding',
    agentId,
    requestedAgentType: 'enterprise-harness:implementer',
    runId: execute.runId,
    handoffRole: 'execute',
    handoffPath: execute.path,
    cwd: bindingCwd,
  });
  appendAgentEvent(root, changeId, {
    kind: 'start',
    agentId,
    observedAgentType: 'enterprise-harness:implementer',
    runId: execute.runId,
    handoffRole: 'execute',
    handoffPath: execute.path,
    cwd: bindingCwd,
  });

  const directWrite = cleanPreWrite({
    root,
    event: {
      tool_name: 'Write',
      tool_use_id: 'direct-write',
      agent_id: agentId,
      cwd: root,
      tool_input: { file_path: path.join(root, targetRef) },
    },
  });
  assert.equal(directWrite.exitCode, 2, 'v6 governed writes must not accept direct Write/Edit authorization');
  assert.match(directWrite.stderr, /task-run|runner|受治理/u);

  const arbitraryBash = cleanPreWrite({
    root,
    event: {
      tool_name: 'Bash',
      tool_use_id: 'arbitrary-bash',
      agent_id: agentId,
      cwd: root,
      tool_input: { command: `node -e "require('node:fs').writeFileSync('${targetRef}', 'bypass')"` },
    },
  });
  assert.equal(arbitraryBash.exitCode, 2, 'an implementer must not bypass task-run with arbitrary Bash');

  const launcher = `node "${runner}" ${changeId} ${taskId} ${execute.runId} verify`;
  const wrongPhase = cleanPreWrite({
    root,
    event: {
      tool_name: 'Bash',
      tool_use_id: 'wrong-phase',
      agent_id: agentId,
      cwd: root,
      tool_input: { command: `node "${runner}" ${changeId} ${taskId} ${execute.runId} red` },
    },
  });
  assert.equal(wrongPhase.exitCode, 2, 'launcher phase must match the next frozen phase');

  const externalArgv = cleanPreWrite({
    root,
    event: {
      tool_name: 'Bash',
      tool_use_id: 'external-child-argv',
      agent_id: agentId,
      cwd: root,
      tool_input: { command: `${launcher} -- node -e process.exit(0)` },
    },
  });
  assert.equal(externalArgv.exitCode, 2, 'launcher must resolve frozen argv internally');

  const authorized = cleanPreWrite({
    root,
    event: {
      tool_name: 'Bash',
      tool_use_id: 'task-run-launch',
      agent_id: agentId,
      cwd: root,
      tool_input: { command: launcher },
    },
  });
  assert.equal(authorized.exitCode, 0, authorized.stderr);

  const authorizationPath = path.join(
    gitCommonDir(root),
    'enterprise-harness',
    'active-task-runs',
    changeId,
    `${execute.runId}.json`,
  );
  fs.mkdirSync(path.dirname(authorizationPath), { recursive: true });
  fs.writeFileSync(authorizationPath, '{"stale":true}\n');
  const staleReplay = run(process.execPath, [runner, changeId, taskId, execute.runId, 'verify']);
  assert.notEqual(staleReplay.status, 0, 'a stale active-run marker must not authorize a replay');
  assert.equal(fs.existsSync(authorizationPath), true, 'runner must not delete an authorization it did not create');
  fs.rmSync(authorizationPath);

  const failed = run(
    process.execPath,
    [runner, changeId, taskId, execute.runId, 'verify'],
    { FORCE_TASK_FAILURE: '1' },
  );
  assert.notEqual(failed.status, 0, 'failing frozen child must fail task-run');
  assert.equal(fs.existsSync(authorizationPath), false, 'active authorization must close after child failure');
  assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, taskId)), false);
  fs.rmSync(taskExecutionReceiptSpoolPath(root, changeId, taskId, execute.runId), { force: true });
  fs.rmSync(`${taskExecutionReceiptSpoolPath(root, changeId, taskId, execute.runId)}.intent`, { force: true });

  const executed = run(process.execPath, [runner, changeId, taskId, execute.runId, 'verify']);
  mustPass(executed, 'authorized task-run');
  assert.equal(fs.readFileSync(path.join(root, targetRef), 'utf-8'), 'class App { int value = 1; }\n');
  assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, taskId)), true);
  assert.equal(fs.existsSync(authorizationPath), false, 'active runner authorization must be removed after child exit');

  console.log(`PASS governed-task-run-write-gate ${mode}`);
} finally {
  fs.rmSync(rootAlias, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
}
