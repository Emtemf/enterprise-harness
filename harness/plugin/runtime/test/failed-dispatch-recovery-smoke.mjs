import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHandoffInput } from '../lib/handoff.mjs';

const sourceRoot = process.cwd();
const changeId = 'failed-dispatch-probe';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-failed-dispatch-'));
  fs.mkdirSync(path.join(root, 'harness/changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(
    path.join(root, 'harness/changes', changeId, 'state.json'),
    `${JSON.stringify({ changeId })}\n`,
  );
  fs.copyFileSync(
    path.join(sourceRoot, 'harness/behavior-checks.json'),
    path.join(root, 'harness/behavior-checks.json'),
  );
  spawnSync('git', ['init', '-q'], { cwd: root, shell: false });
  return root;
}

function hook(root, script, payload) {
  return spawnSync('node', [path.join(sourceRoot, 'harness/plugin/runtime/hooks', script)], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    shell: false,
  });
}

function dispatchThenFail(root, toolUseId) {
  const input = createHandoffInput(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    role: 'execute',
    parentRunId: null,
  });
  const marker = path.relative(root, input.path);
  const dispatched = hook(root, 'pre-agent.mjs', {
    tool_name: 'Agent',
    tool_use_id: toolUseId,
    session_id: 'session-failed',
    tool_input: {
      subagent_type: 'enterprise-harness:code-explore',
      prompt: `HANDOFF_INPUT=${marker}\nExplore.`,
    },
  });
  assert.equal(dispatched.status, 0, dispatched.stderr);
  const failed = hook(root, 'agent-failure.mjs', {
    tool_name: 'Agent',
    tool_use_id: toolUseId,
    session_id: 'session-failed',
    tool_input: { subagent_type: 'enterprise-harness:code-explore' },
    error: "Agent type 'enterprise-harness:code-explore' not found.",
  });
  assert.equal(failed.status, 0, failed.stderr);
  return input.envelope.runId;
}

// A dispatch that never produced a subagent must not permanently block TaskCompleted:
// the ledger already records the failure, so the gate has the evidence it needs.
{
  const root = fixture();
  dispatchThenFail(root, 'tool-failed-only');
  const gate = hook(root, 'task-completed.mjs', {
    hook_event_name: 'TaskCompleted',
    session_id: 'session-failed',
  });
  assert.equal(
    gate.status,
    0,
    `failed dispatch must not block TaskCompleted; stderr=${gate.stderr}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// A failed dispatch must not mask a genuinely incomplete execution that came before it.
{
  const root = fixture();
  const pending = createHandoffInput(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.synthesize',
    role: 'execute',
    parentRunId: null,
  });
  assert.equal(hook(root, 'pre-agent.mjs', {
    tool_name: 'Agent',
    tool_use_id: 'tool-pending',
    session_id: 'session-failed',
    tool_input: {
      subagent_type: 'enterprise-harness:clarify-synthesizer',
      prompt: `HANDOFF_INPUT=${path.relative(root, pending.path)}\nSynthesize.`,
    },
  }).status, 0);
  dispatchThenFail(root, 'tool-failed-after-pending');
  const gate = hook(root, 'task-completed.mjs', {
    hook_event_name: 'TaskCompleted',
    session_id: 'session-failed',
  });
  assert.equal(gate.status, 2, 'unchecked prior execution must still block');
  assert.match(gate.stderr, /EH-CHECKER-REQUIRED-005/);
  assert.match(gate.stderr, /clarify\.synthesize/);
  fs.rmSync(root, { recursive: true, force: true });
}

// A run that failed and was then retried successfully must be judged on the retry.
{
  const root = fixture();
  const runId = dispatchThenFail(root, 'tool-retry-first');
  const retried = hook(root, 'pre-agent.mjs', {
    tool_name: 'Agent',
    tool_use_id: 'tool-retry-second',
    session_id: 'session-failed',
    tool_input: {
      subagent_type: 'enterprise-harness:code-explore',
      prompt: `HANDOFF_INPUT=${path.relative(root, path.join(root, 'harness/changes', changeId, 'runs', runId, 'input.json'))}\nRetry.`,
    },
  });
  assert.equal(retried.status, 0, retried.stderr);
  const gate = hook(root, 'task-completed.mjs', {
    hook_event_name: 'TaskCompleted',
    session_id: 'session-failed',
  });
  assert.equal(gate.status, 2, 'retried dispatch still needs an independent checker');
  assert.match(gate.stderr, /EH-CHECKER-REQUIRED-005/);
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`PASS failed-dispatch-recovery ${process.argv[2] || 'verify'}`);
