import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../../runtime/lib/agent-evidence.mjs';
import { createHandoffV2 } from '../../runtime/core/handoff-v2.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from '../../runtime/test/classification-v2-fixture.mjs';
import { updateChangeState } from '../../runtime/core/change-state.mjs';
import {
  readTaskExecutionReceipt,
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
} from '../../runtime/lib/task-execution-receipt.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-external-maven-'));
const target = path.join(temp, 'target');
const changeId = 'greeting-api';
const taskId = 'task-greeting';
const agentId = 'external-e2e-agent';
const implementation = 'src/main/java/example/GreetingService.java';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || target,
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

function commandOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function mustPass(result, label) {
  assert.equal(result.status, 0, `${label}\n${commandOutput(result)}`);
}

const STAGED_EXCLUDES = [
  'changes',
  'archive',
  'work',
  'lessons',
  'ACTIVE_CHANGE',
  'command-policy.json',
  'evidence-policy.json',
];

function stageRuntime() {
  fs.cpSync(path.join(sourceRoot, 'harness'), path.join(target, 'harness'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(sourceRoot, 'harness'), source);
      if (!relative) return true;
      const [head] = relative.split(path.sep);
      return !STAGED_EXCLUDES.includes(head);
    },
  });
  fs.cpSync(path.join(sourceRoot, 'runtime'), path.join(target, 'runtime'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(path.join(sourceRoot, 'runtime'), source);
      return relative !== 'test' && relative !== path.join('test');
    },
  });
  fs.copyFileSync(
    path.join(sourceRoot, 'harness/templates/command-policy.maven.json'),
    path.join(target, 'harness/command-policy.json'),
  );
}

function createExecuteHandoff() {
  const created = createHandoffV2(target, {
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
  appendAgentEvent(target, changeId, {
    kind: 'dispatch-binding',
    agentId,
    requestedAgentType: 'enterprise-harness:implementer',
    runId: created.runId,
    handoffRole: 'execute',
    handoffPath: created.path,
    cwd: target,
  });
  appendAgentEvent(target, changeId, {
    kind: 'start',
    agentId,
    observedAgentType: 'enterprise-harness:implementer',
    runId: created.runId,
    handoffRole: 'execute',
    handoffPath: created.path,
    cwd: target,
  });
  return created;
}

function taskRun(runId, phase) {
  return run(process.execPath, [
    path.join(target, 'runtime/task-run.mjs'),
    changeId,
    taskId,
    runId,
    phase,
  ]);
}

try {
  fs.cpSync(
    path.join(sourceRoot, 'test/fixtures/maven-spring-project'),
    target,
    { recursive: true },
  );
  const implementationText = fs.readFileSync(path.join(target, implementation), 'utf-8');
  fs.rmSync(path.join(target, implementation));
  mustPass(run('git', ['init']), 'git init');
  mustPass(run('git', ['config', 'user.email', 'fixture@example.test']), 'git email');
  mustPass(run('git', ['config', 'user.name', 'Fixture']), 'git name');
  mustPass(run('git', ['add', '.']), 'git add');
  mustPass(run('git', ['commit', '-m', 'broken baseline for real RED']), 'git commit');

  stageRuntime();
  mustPass(run(process.execPath, [
    path.join(target, 'runtime/cli.mjs'),
    'start-change',
    changeId,
    'e2e',
    'L1',
    'greeting',
  ]), 'start change');

  const classification = writeClassificationArtifact(target, changeId, {
    impact: {
      api: 'no',
      data: 'no',
      architecture: 'no',
      rule: 'yes',
      security: 'no',
    },
    decision: { tier: 'L1' },
  });
  const statePath = path.join(target, `harness/changes/${changeId}/state.json`);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  updateChangeState(
    target,
    changeId,
    (current) => ({
      ...current,
      stage: 'implement',
      currentTask: taskId,
      artifacts: {
        ...current.artifacts,
        classification,
      },
    }),
    {
      expectedRevision: state.revision,
      type: 'external-e2e-enter-implement',
      actor: 'external-e2e',
    },
  );

  fs.writeFileSync(
    path.join(target, `harness/changes/${changeId}/tasks.md`),
    `# Tasks\n\n## ${taskId}\n\n- Add GreetingService with a deterministic greeting contract.\n`,
  );
  fs.writeFileSync(
    path.join(target, `harness/changes/${changeId}/task-commands.json`),
    `${JSON.stringify({
      schemaVersion: 3,
      tasks: {
        [taskId]: {
          executionStrategy: 'tdd',
          redCommand: ['mvn', '-q', '-Dtest=GreetingServiceTest', 'test'],
          greenCommand: ['mvn', '-q', '-Dtest=GreetingServiceTest', 'test'],
          refactorCommand: ['mvn', '-q', 'verify'],
        },
      },
    }, null, 2)}\n`,
  );
  mustPass(run('git', ['add', '.']), 'git add staged runtime');
  mustPass(run('git', ['commit', '-m', 'stage v6 runtime and change']), 'git commit staged runtime');

  const execute = createExecuteHandoff();
  const red = taskRun(execute.runId, 'red');
  assert.notEqual(red.status, 0, 'RED must fail because the target implementation is absent');
  assert.match(commandOutput(red), /ClassNotFoundException|example\.GreetingService/u);
  assert.equal(
    fs.existsSync(taskExecutionReceiptPath(target, changeId, taskId)),
    false,
    'RED must not finalize the durable receipt',
  );

  fs.mkdirSync(path.dirname(path.join(target, implementation)), { recursive: true });
  fs.writeFileSync(path.join(target, implementation), implementationText);
  mustPass(taskRun(execute.runId, 'green'), 'Maven GREEN');
  mustPass(taskRun(execute.runId, 'refactor'), 'Maven REFACTOR');

  const receipt = readTaskExecutionReceipt(target, changeId, taskId, {
    expectedStrategy: 'tdd',
    expectedAgent: agentId,
    expectedInputDigests: execute.input.inputDigests,
    requireTrusted: true,
    requireFreshInputs: true,
  });
  assert.equal(receipt.ok, true, receipt.problems.join('; '));
  assert.equal(receipt.receipt.provenance, 'runtime-runner');
  assert.equal(receipt.receipt.agent.type, 'enterprise-harness:implementer');
  assert.deepEqual(receipt.receipt.executions.map((execution) => execution.phase), [
    'RED',
    'GREEN',
    'REFACTOR',
  ]);
  assert.equal(
    fs.existsSync(taskExecutionReceiptSpoolPath(
      target,
      changeId,
      taskId,
      execute.runId,
    )),
    true,
    'canonical task-run must publish its common-dir receipt spool',
  );

  mustPass(run('mvn', ['-q', 'verify']), 'external verify');
  console.log('PASS external-project-maven-lifecycle e2e');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
