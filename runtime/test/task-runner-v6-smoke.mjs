import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { activeTaskRunAuthorizationPath } from '../lib/task-run-authorization.mjs';
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
const rootAlias = `${root}-alias`;
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

function waitForFile(file, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
    Atomics.wait(signal, 0, 0, 10);
  }
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function createExecuteHandoff(
  taskId,
  bindingCwd = root,
  lifecycle = 'active',
  boundAgentId = agentId,
) {
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle,
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
    agentId: boundAgentId,
    requestedAgentType: 'enterprise-harness:implementer',
    runId: created.runId,
    handoffRole: 'execute',
    handoffPath: created.path,
    cwd: bindingCwd,
  });
  appendAgentEvent(root, changeId, {
    kind: 'start',
    agentId: boundAgentId,
    observedAgentType: 'enterprise-harness:implementer',
    runId: created.runId,
    handoffRole: 'execute',
    handoffPath: created.path,
    cwd: bindingCwd,
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
  const concurrentStarted = path.join(root, 'concurrent-started');
  const concurrentRelease = path.join(root, 'concurrent-release');
  const concurrentExecutions = path.join(root, 'concurrent-executions');
  const recoveryExecutions = path.join(root, 'recovery-executions');
  const nonExecutableCommand = path.join(root, 'non-executable-task');
  const malformedAuthorizationTarget = path.join(root, 'malformed-authorization-ran');
  const concurrentChild = path.join(root, 'concurrent-task.mjs');
  fs.writeFileSync(concurrentChild, [
    "import fs from 'node:fs';",
    "const [started, release, executions] = process.argv.slice(2);",
    "fs.appendFileSync(executions, 'run\\n');",
    "fs.writeFileSync(started, 'started\\n');",
    'const signal = new Int32Array(new SharedArrayBuffer(4));',
    'while (!fs.existsSync(release)) Atomics.wait(signal, 0, 0, 10);',
    '',
  ].join('\n'));
  fs.writeFileSync(
    nonExecutableCommand,
    "#!/usr/bin/env node\nrequire('node:fs').writeFileSync('non-executable-ran', 'x');\n",
    { mode: 0o600 },
  );
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
      'task-recovery': {
        executionStrategy: 'direct',
        strategyRationale: 'A complete spool must recover canonical publication without rerunning the child.',
        verifyCommand: [
          'node',
          '-e',
          "require('node:fs').appendFileSync(process.argv[1], 'run\\n')",
          recoveryExecutions,
        ],
      },
      'task-concurrent': {
        executionStrategy: 'direct',
        strategyRationale: 'A task-level lock must prevent duplicate side effects across execute runs.',
        verifyCommand: [
          'node',
          concurrentChild,
          concurrentStarted,
          concurrentRelease,
          concurrentExecutions,
        ],
      },
      'task-switch-active': {
        executionStrategy: 'direct',
        strategyRationale: 'Changing the active workflow during execution must block receipt publication.',
        verifyCommand: [
          'node',
          '-e',
          "require('node:fs').writeFileSync('harness/ACTIVE_CHANGE', 'other-change\\n')",
        ],
      },
      'task-mutating': {
        executionStrategy: 'direct',
        strategyRationale: 'Mutating a frozen input during execution must prevent receipt publication.',
        verifyCommand: [
          'node',
          '-e',
          `require('node:fs').appendFileSync('harness/changes/${changeId}/task-commands.json', '\\n')`,
        ],
      },
      'task-spawn-error': {
        executionStrategy: 'tdd',
        redCommand: ['enterprise-harness-command-that-does-not-exist'],
        greenCommand: ['node', '-e', 'process.exit(0)'],
        refactorCommand: ['node', '-e', 'process.exit(0)'],
      },
      'task-non-executable': {
        executionStrategy: 'tdd',
        redCommand: [nonExecutableCommand],
        greenCommand: ['node', '-e', 'process.exit(0)'],
        refactorCommand: ['node', '-e', 'process.exit(0)'],
      },
      'task-malformed-authorization': {
        executionStrategy: 'direct',
        strategyRationale: 'A malformed active authorization marker must block before the command starts.',
        verifyCommand: [
          'node',
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(malformedAuthorizationTarget)}, 'x')`,
        ],
      },
      'task-signal': {
        executionStrategy: 'tdd',
        redCommand: ['node', '-e', "process.kill(process.pid, 'SIGTERM')"],
        greenCommand: ['node', '-e', 'process.exit(0)'],
        refactorCommand: ['node', '-e', 'process.exit(0)'],
      },
    },
  }, null, 2)}\n`);

  const missingState = createExecuteHandoff('task-missing-state');
  fs.rmSync(path.join(changeDir, 'state.json'));
  const missingStateResult = taskRun('task-missing-state', missingState.runId, 'verify');
  assert.equal(missingStateResult.status, 2);
  assert.match(`${missingStateResult.stdout}\n${missingStateResult.stderr}`, /state\.json is missing/u);

  const wrongSchema = createExecuteHandoff('task-wrong-schema');
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 5,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: 'task-wrong-schema',
  }, null, 2)}\n`, 'utf-8');
  const wrongSchemaResult = taskRun('task-wrong-schema', wrongSchema.runId, 'verify');
  assert.equal(wrongSchemaResult.status, 2);
  assert.match(`${wrongSchemaResult.stdout}\n${wrongSchemaResult.stderr}`, /State v6|task-run only accepts State v6/u);

  const wrongStage = createExecuteHandoff('task-wrong-stage');
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    currentTask: 'task-wrong-stage',
  }, null, 2)}\n`, 'utf-8');
  const wrongStageResult = taskRun('task-wrong-stage', wrongStage.runId, 'verify');
  assert.equal(wrongStageResult.status, 2);
  assert.match(`${wrongStageResult.stdout}\n${wrongStageResult.stderr}`, /stage must be implement/u);

  const wrongCurrentTask = createExecuteHandoff('task-wrong-current');
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: 'some-other-task',
  }, null, 2)}\n`, 'utf-8');
  const wrongCurrentTaskResult = taskRun('task-wrong-current', wrongCurrentTask.runId, 'verify');
  assert.equal(wrongCurrentTaskResult.status, 2);
  assert.match(`${wrongCurrentTaskResult.stdout}\n${wrongCurrentTaskResult.stderr}`, /currentTask must be task-wrong-current/u);

  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: 'task-direct',
  }, null, 2)}\n`, 'utf-8');

  mustPass(run('git', ['init', '-q']), 'git init');
  mustPass(run('git', ['config', 'user.email', 'runner@example.test']), 'git email');
  mustPass(run('git', ['add', '.']), 'git add');
  mustPass(run('git', ['commit', '-qm', 'fixture']), 'git commit');
  // macOS may record /var/... in the start event while the child resolves cwd to /private/var/....
  const bindingCwd = process.platform === 'win32' ? root : rootAlias;
  if (bindingCwd !== root) fs.symlinkSync(root, bindingCwd, 'dir');

  const inactive = createExecuteHandoff('task-direct', root, 'archived');
  const inactiveResult = taskRun('task-direct', inactive.runId, 'verify');
  assert.equal(inactiveResult.status, 2);
  assert.match(`${inactiveResult.stdout}\n${inactiveResult.stderr}`, /lifecycle must be active/u);

  const direct = createExecuteHandoff('task-direct', bindingCwd);
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
  mustPass(repeated, 'repeated finalized task-run must recover existing receipt');

  const unrelatedRun = createExecuteHandoff('task-direct');
  const unrelatedResult = taskRun('task-direct', unrelatedRun.runId, 'verify');
  assert.equal(unrelatedResult.status, 2, 'a finalized receipt must not be adopted by another execute run');
  assert.match(`${unrelatedResult.stdout}\n${unrelatedResult.stderr}`, /receipt spool|execute run/u);

  const recovery = createExecuteHandoff('task-recovery');
  mustPass(taskRun('task-recovery', recovery.runId, 'verify'), 'recovery initial VERIFY');
  const recoveryCanonical = taskExecutionReceiptPath(root, changeId, 'task-recovery');
  const recoverySpool = taskExecutionReceiptSpoolPath(
    root,
    changeId,
    'task-recovery',
    recovery.runId,
  );
  fs.rmSync(recoveryCanonical);
  const abandonedLock = path.join(path.dirname(recoverySpool), 'task-execution.lock');
  fs.mkdirSync(abandonedLock);
  fs.writeFileSync(
    path.join(abandonedLock, 'owner.json'),
    `${JSON.stringify({ pid: 2147483647 })}\n`,
  );
  const staleLockTime = new Date(Date.now() - 60_000);
  fs.utimesSync(abandonedLock, staleLockTime, staleLockTime);
  fs.writeFileSync(
    activeTaskRunAuthorizationPath(root, changeId, recovery.runId),
    `${JSON.stringify({ pid: 2147483647, runId: recovery.runId })}\n`,
  );
  mustPass(taskRun('task-recovery', recovery.runId, 'verify'), 'recovery canonical republish');
  assert.equal(fs.readFileSync(recoveryExecutions, 'utf-8'), 'run\n');
  assert.equal(fs.existsSync(recoveryCanonical), true);

  const tdd = createExecuteHandoff('task-tdd');
  const red = taskRun('task-tdd', tdd.runId, 'red', ['node', '-e', 'process.exit(7)']);
  assert.equal(red.status, 7, `RED must preserve the child failure status\n${red.stdout}\n${red.stderr}`);
  assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, 'task-tdd')), false);
  const tddSpoolPath = taskExecutionReceiptSpoolPath(root, changeId, 'task-tdd', tdd.runId);
  const validRedSpool = JSON.parse(fs.readFileSync(tddSpoolPath, 'utf-8'));
  const forgedSpool = {
    ...validRedSpool,
    receipt: {
      ...validRedSpool.receipt,
      executions: [
        ...validRedSpool.receipt.executions,
        {
          ...validRedSpool.receipt.executions[0],
          phase: 'REFACTOR',
          exitCode: 0,
        },
      ],
    },
  };
  fs.writeFileSync(tddSpoolPath, `${JSON.stringify(forgedSpool, null, 2)}\n`);
  const forgedProgress = taskRun('task-tdd', tdd.runId, 'green');
  assert.equal(forgedProgress.status, 2);
  assert.match(`${forgedProgress.stdout}\n${forgedProgress.stderr}`, /spool is invalid|must be phase GREEN/u);
  fs.writeFileSync(tddSpoolPath, `${JSON.stringify(validRedSpool, null, 2)}\n`);
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

  const spawnError = createExecuteHandoff('task-spawn-error');
  const spawnErrorResult = taskRun('task-spawn-error', spawnError.runId, 'red');
  assert.equal(spawnErrorResult.status, 2, 'spawn failure must be a runner protocol error, not a valid RED');
  assert.match(`${spawnErrorResult.stdout}\n${spawnErrorResult.stderr}`, /spawn|ENOENT|launch/u);
  assert.equal(
    fs.existsSync(taskExecutionReceiptSpoolPath(root, changeId, 'task-spawn-error', spawnError.runId)),
    false,
    'spawn failure must not publish a trusted receipt spool',
  );
  assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, 'task-spawn-error')), false);

  if (process.platform !== 'win32') {
    const nonExecutable = createExecuteHandoff('task-non-executable');
    const nonExecutableResult = taskRun('task-non-executable', nonExecutable.runId, 'red');
    assert.equal(nonExecutableResult.status, 2, 'a non-executable command must be a spawn failure, not a valid RED');
    assert.match(`${nonExecutableResult.stdout}\n${nonExecutableResult.stderr}`, /spawn|EACCES|permission/u);
    assert.equal(
      fs.existsSync(taskExecutionReceiptSpoolPath(root, changeId, 'task-non-executable', nonExecutable.runId)),
      false,
      'a non-executable command must not publish a trusted receipt spool',
    );
    assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, 'task-non-executable')), false);
    assert.equal(fs.existsSync(path.join(root, 'non-executable-ran')), false);
  }

  const malformedAuthorization = createExecuteHandoff('task-malformed-authorization');
  const malformedAuthorizationPath = activeTaskRunAuthorizationPath(
    root,
    changeId,
    malformedAuthorization.runId,
  );
  fs.mkdirSync(path.dirname(malformedAuthorizationPath), { recursive: true });
  fs.writeFileSync(malformedAuthorizationPath, '{invalid');
  const malformedAuthorizationResult = taskRun(
    'task-malformed-authorization',
    malformedAuthorization.runId,
    'verify',
  );
  assert.equal(malformedAuthorizationResult.status, 2, 'a malformed authorization marker must fail closed');
  assert.match(
    `${malformedAuthorizationResult.stdout}\n${malformedAuthorizationResult.stderr}`,
    /authorization|runtime artifact already exists/u,
  );
  assert.equal(fs.existsSync(malformedAuthorizationTarget), false);
  assert.equal(fs.existsSync(malformedAuthorizationPath), true, 'ambiguous marker must require explicit recovery');
  fs.rmSync(malformedAuthorizationPath, { force: true });

  if (process.platform !== 'win32') {
    const signaled = createExecuteHandoff('task-signal');
    const signaledResult = taskRun('task-signal', signaled.runId, 'red');
    assert.equal(signaledResult.status, 2, 'signal termination must not satisfy RED');
    assert.match(`${signaledResult.stdout}\n${signaledResult.stderr}`, /signal|SIGTERM/u);
    assert.equal(
      fs.existsSync(taskExecutionReceiptSpoolPath(root, changeId, 'task-signal', signaled.runId)),
      false,
      'signal termination must not publish a trusted receipt spool',
    );
    assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, 'task-signal')), false);
  }

  const concurrentA = createExecuteHandoff(
    'task-concurrent',
    root,
    'active',
    'implementer-concurrent-a',
  );
  const concurrentB = createExecuteHandoff(
    'task-concurrent',
    root,
    'active',
    'implementer-concurrent-b',
  );
  const firstConcurrent = spawn(process.execPath, [
    runner,
    changeId,
    'task-concurrent',
    concurrentA.runId,
    'verify',
  ], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_SESSION_ID: '',
      CLAUDE_SESSION_ID: '',
      HARNESS_IMPLEMENTER_ID: 'implementer-concurrent-a',
    },
  });
  const firstConcurrentResult = waitForChild(firstConcurrent);
  waitForFile(concurrentStarted);
  let duplicateConcurrent;
  try {
    duplicateConcurrent = run(process.execPath, [
      runner,
      changeId,
      'task-concurrent',
      concurrentB.runId,
      'verify',
    ], {
      env: { HARNESS_IMPLEMENTER_ID: 'implementer-concurrent-b' },
    });
  } finally {
    fs.writeFileSync(concurrentRelease, 'release\n');
  }
  mustPass(await firstConcurrentResult, 'first concurrent task-run');
  assert.equal(duplicateConcurrent.status, 2);
  assert.match(
    `${duplicateConcurrent.stdout}\n${duplicateConcurrent.stderr}`,
    /concurrent update|task-execution/u,
  );
  assert.equal(fs.readFileSync(concurrentExecutions, 'utf-8'), 'run\n');

  const switchedActive = createExecuteHandoff('task-switch-active');
  const switchedActiveResult = taskRun('task-switch-active', switchedActive.runId, 'verify');
  assert.equal(switchedActiveResult.status, 2);
  assert.match(
    `${switchedActiveResult.stdout}\n${switchedActiveResult.stderr}`,
    /active change is not/u,
  );
  assert.equal(
    fs.existsSync(taskExecutionReceiptPath(root, changeId, 'task-switch-active')),
    false,
  );
  assert.equal(
    fs.existsSync(taskExecutionReceiptSpoolPath(
      root,
      changeId,
      'task-switch-active',
      switchedActive.runId,
    )),
    false,
  );
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);

  const commandsPath = path.join(changeDir, 'task-commands.json');
  const frozenCommands = fs.readFileSync(commandsPath);
  const mutating = createExecuteHandoff('task-mutating');
  const mutatedInput = taskRun('task-mutating', mutating.runId, 'verify');
  assert.equal(mutatedInput.status, 2);
  assert.match(`${mutatedInput.stdout}\n${mutatedInput.stderr}`, /stale/u);
  assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, 'task-mutating')), false);
  assert.equal(
    fs.existsSync(taskExecutionReceiptSpoolPath(
      root,
      changeId,
      'task-mutating',
      mutating.runId,
    )),
    false,
  );
  fs.writeFileSync(commandsPath, frozenCommands);

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
  fs.rmSync(rootAlias, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
}
