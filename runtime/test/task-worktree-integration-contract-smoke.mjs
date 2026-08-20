import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { bindSession } from '../lib/sessions.mjs';
import { readTaskIntegrationReceipt } from '../lib/task-integration.mjs';
import { taskExecutionReceiptPath } from '../lib/task-execution-receipt.mjs';
import { preWrite } from '../lib/hooks/pre-write.mjs';
import { computeStageGateDigest, stageGateMarkerPath } from '../lib/execution-prerequisites.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-worktree-integration-'));
const worker = path.join(root, '.worker');
const changeId = 'worktree-integration';
const taskId = 'task-one';
const sessionId = 'session-worktree-integration';
const agentId = 'agent-worktree-integration';
const changeDir = path.join(root, 'harness', 'changes', changeId);

function run(command, args, cwd = root, env = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_SESSION_ID: sessionId,
      CLAUDE_SESSION_ID: '',
      ...env,
    },
  });
}

function mustPass(result, label) {
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

try {
  mustPass(run('git', ['init', '-q']), 'git init');
  mustPass(run('git', ['config', 'user.email', 'harness@example.invalid']), 'git email');
  mustPass(run('git', ['config', 'user.name', 'Harness Worktree Test']), 'git name');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'probe.txt'), 'before\n');
  mustPass(run('git', ['add', 'src/probe.txt']), 'git add');
  mustPass(run('git', ['commit', '-qm', 'baseline']), 'git baseline');
  mustPass(run('git', ['worktree', 'add', '--detach', worker, 'HEAD']), 'git worktree add');

  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    changeId,
    lifecycle: 'active',
    stage: 'implement',
    currentTask: taskId,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n\n## Task 1: task-one\n');
  fs.writeFileSync(path.join(changeDir, 'task-commands.json'), `${JSON.stringify({
    schemaVersion: 3,
    tasks: {
      [taskId]: {
        executionStrategy: 'direct',
        strategyRationale: 'A deterministic fixture command exercises the worktree bridge.',
        verifyCommand: [
          'node',
          '-e',
          "require('node:fs').writeFileSync('src/probe.txt', 'after\\n')",
        ],
      },
    },
  }, null, 2)}\n`);
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    subjectRoot: root,
    controllerRevision: 'worktree-contract-test',
  });

  const inputRefs = [
    `harness/changes/${changeId}/state.json`,
    `harness/changes/${changeId}/tasks.md`,
    `harness/changes/${changeId}/task-commands.json`,
  ];
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'implement.task',
    role: 'execute',
    agent: { type: 'enterprise-harness:implementer', skill: 'implement' },
    inputRefs,
    tecpc: {
      target: 'exercise subject/worktree integration',
      evidence: inputRefs,
      context: inputRefs,
      path: 'subject -> worktree -> subject',
      correction: null,
    },
  });
  for (const event of [
    {
      kind: 'dispatch',
      sessionId,
      toolUseId: 'tool-worktree',
      requestedAgentType: 'enterprise-harness:implementer',
      runId: handoff.runId,
      handoffRole: 'execute',
    },
    {
      kind: 'start',
      sessionId,
      agentId,
      observedAgentType: 'enterprise-harness:implementer',
      runId: handoff.runId,
      handoffRole: 'execute',
      cwd: worker,
    },
    {
      kind: 'dispatch-binding',
      sessionId,
      toolUseId: 'tool-worktree',
      agentId,
      requestedAgentType: 'enterprise-harness:implementer',
      runId: handoff.runId,
      handoffRole: 'execute',
      cwd: worker,
    },
  ]) appendAgentEvent(root, changeId, event);

  const priorSessionId = process.env.ENTERPRISE_HARNESS_SESSION_ID;
  process.env.ENTERPRISE_HARNESS_SESSION_ID = sessionId;
  const launcherCommand = `node "${path.join(sourceRoot, 'runtime', 'cli.mjs')}" task-run ${changeId} ${taskId} ${handoff.runId} verify`;
  const gatePath = stageGateMarkerPath(root, changeId);
  fs.mkdirSync(path.dirname(gatePath), { recursive: true });
  fs.writeFileSync(gatePath, `${JSON.stringify({
    ok: true,
    stage: 'implement',
    changeDigest: computeStageGateDigest(root, changeId),
  }, null, 2)}\n`);
  const preflight = preWrite({
    root: worker,
    event: {
      cwd: worker,
      tool_name: 'Bash',
      tool_use_id: 'tool-worktree-preflight',
      agent_id: agentId,
      tool_input: { command: launcherCommand },
    },
  });
  if (priorSessionId === undefined) delete process.env.ENTERPRISE_HARNESS_SESSION_ID;
  else process.env.ENTERPRISE_HARNESS_SESSION_ID = priorSessionId;
  assert.equal(preflight.exitCode, 0, preflight.stderr);

  assert.equal(fs.existsSync(path.join(worker, 'harness', 'changes')), false);
  const executed = run(process.execPath, [
    path.join(sourceRoot, 'runtime', 'task-run.mjs'),
    changeId,
    taskId,
    handoff.runId,
    'verify',
  ], worker, { CLAUDE_AGENT_ID: agentId });
  mustPass(executed, 'isolated task-run');
  assert.equal(fs.readFileSync(path.join(worker, 'src', 'probe.txt'), 'utf-8'), 'after\n');
  assert.equal(fs.readFileSync(path.join(root, 'src', 'probe.txt'), 'utf-8'), 'before\n');
  assert.equal(fs.existsSync(taskExecutionReceiptPath(root, changeId, taskId)), true);
  assert.equal(fs.existsSync(path.join(worker, 'harness', 'changes')), false);

  const finalized = run(process.execPath, [
    path.join(sourceRoot, 'skills', 'implement', 'scripts', 'finalize-result.mjs'),
    changeId,
    taskId,
    handoff.runId,
  ], worker, { CLAUDE_AGENT_ID: agentId });
  mustPass(finalized, 'isolated implement finalizer');
  const resultPath = path.join(worker, 'stage-result.json');
  fs.writeFileSync(resultPath, finalized.stdout);
  const persisted = run(process.execPath, [
    path.join(sourceRoot, 'runtime', 'handoff.mjs'),
    'persist',
    changeId,
    handoff.runId,
    'stage-result.json',
  ], worker, { CLAUDE_AGENT_ID: agentId });
  mustPass(persisted, 'isolated handoff persistence');

  const receiptRef = `harness/changes/${changeId}/evidence/tasks/${taskId}.json`;
  const reviewHandoff = createHandoffV2(root, {
    changeId,
    stage: 'implement',
    behavior: 'review.task',
    role: 'check',
    parentRunId: handoff.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [receiptRef],
    tecpc: {
      target: 'independently review isolated task output',
      evidence: [receiptRef],
      context: inputRefs,
      path: 'execution receipt -> review -> integration',
      correction: null,
    },
  });
  const stageResult = JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, handoff.runId), 'utf-8'));
  const reviewResult = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'implement',
    runId: reviewHandoff.runId,
    parentRunId: handoff.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: handoff.runId,
    reviewedArtifacts: stageResult.artifacts,
    rubricIds: [...reviewHandoff.input.rubricIds],
    tecpc: reviewHandoff.input.tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: new Date().toISOString(),
  };
  fs.writeFileSync(v2ResultPath(root, changeId, reviewHandoff.runId, 'check'), `${JSON.stringify(reviewResult, null, 2)}\n`);

  const premature = run(process.execPath, [
    path.join(sourceRoot, 'runtime', 'cli.mjs'),
    'task-integrate',
    changeId,
    taskId,
    reviewHandoff.runId,
  ]);
  assert.equal(premature.status, 2);
  assert.match(`${premature.stdout}\n${premature.stderr}`, /does not match reviewed execution output/u);

  const agentClaim = run(process.execPath, [
    path.join(sourceRoot, 'runtime', 'cli.mjs'),
    'task-integrate',
    changeId,
    taskId,
    reviewHandoff.runId,
  ], root, { CLAUDE_AGENT_ID: agentId });
  assert.equal(agentClaim.status, 2);
  assert.match(`${agentClaim.stdout}\n${agentClaim.stderr}`, /controller-owned|subagent/u);

  fs.copyFileSync(path.join(worker, 'src', 'probe.txt'), path.join(root, 'src', 'probe.txt'));
  const integrated = run(process.execPath, [
    path.join(sourceRoot, 'runtime', 'cli.mjs'),
    'task-integrate',
    changeId,
    taskId,
    reviewHandoff.runId,
  ]);
  mustPass(integrated, 'task integration publication');
  const integration = readTaskIntegrationReceipt(root, changeId, taskId);
  assert.equal(integration.ok, true, integration.problems.join('; '));
  assert.equal(integration.receipt.review.runId, reviewHandoff.runId);
  assert.deepEqual(integration.receipt.changedPaths.map((entry) => entry.path), ['src/probe.txt']);
  fs.writeFileSync(path.join(root, 'src', 'probe.txt'), 'tampered\n');
  assert.equal(readTaskIntegrationReceipt(root, changeId, taskId).ok, true);
  assert.match(readTaskIntegrationReceipt(root, changeId, taskId, {
    requireCurrentSubject: true,
  }).problems.join('; '), /subject content is stale/u);
  fs.copyFileSync(path.join(worker, 'src', 'probe.txt'), path.join(root, 'src', 'probe.txt'));
  const executionPath = taskExecutionReceiptPath(root, changeId, taskId);
  const originalExecution = fs.readFileSync(executionPath, 'utf-8');
  fs.appendFileSync(executionPath, '\n');
  assert.equal(readTaskIntegrationReceipt(root, changeId, taskId).ok, false);
  fs.writeFileSync(executionPath, originalExecution);
  const duplicate = run(process.execPath, [
    path.join(sourceRoot, 'runtime', 'cli.mjs'),
    'task-integrate',
    changeId,
    taskId,
    reviewHandoff.runId,
  ]);
  assert.equal(duplicate.status, 2);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /already exists/u);

  console.log(`PASS task-worktree-integration-contract ${mode}`);
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', worker], { cwd: root, encoding: 'utf-8', shell: false });
  fs.rmSync(root, { recursive: true, force: true });
}
