import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  completedHarnessAgent,
  normalizeAgentType,
  readAgentEvents,
} from '../lib/agent-evidence.mjs';
import {
  createHandoffInput,
  HANDOFF_RESULT_END,
  HANDOFF_RESULT_START,
} from '../lib/handoff.mjs';
import { bindSession } from '../lib/sessions.mjs';

const sourceRoot = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-agent-hooks-'));
const changeId = 'agent-hook-probe';
fs.mkdirSync(path.join(root, 'harness/changes', changeId), { recursive: true });
fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
fs.writeFileSync(path.join(root, 'harness/changes', changeId, 'state.json'), `${JSON.stringify({ changeId })}\n`);
fs.copyFileSync(
  path.join(sourceRoot, 'runtime/compat/v5/behavior-checks.json'),
  path.join(root, 'harness/behavior-checks.json'),
);
spawnSync('git', ['init', '-q'], { cwd: root });
bindSession(root, {
  sessionId: 'session-1',
  changeId,
  worktreePath: root,
  controllerRevision: '0.4.0-dev',
}, { commonDir: path.join(root, '.git') });

function hook(script, payload) {
  return spawnSync('node', [path.join(sourceRoot, 'hooks/scripts', script)], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    shell: false,
  });
}

function resultBlock(input, extra = {}) {
  const value = {
    handoffVersion: 1,
    runId: input.runId,
    changeId: input.changeId,
    stage: input.stage,
    behavior: input.behavior,
    role: input.role,
    agent: input.agent,
    tecpc: {
      target: 'fixture target',
      evidence: ['fixture evidence'],
      context: ['fixture context'],
      path: 'fixture path',
      correction: 'fixture correction',
    },
    outputRefs: [],
    blockers: [],
    summary: 'fixture summary',
    ...extra,
  };
  return `${HANDOFF_RESULT_START}\n${JSON.stringify(value, null, 2)}\n${HANDOFF_RESULT_END}`;
}

function create(stage, behavior, role = 'execute', parentRunId = null) {
  return createHandoffInput(root, {
    changeId,
    stage,
    behavior,
    role,
    parentRunId,
    target: `fixture ${behavior} ${role}`,
  });
}

assert.equal(normalizeAgentType('code-explore'), 'enterprise-harness:code-explore');

const bare = hook('pre-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-bare',
  tool_input: { subagent_type: 'code-explore' },
});
assert.equal(bare.status, 2);

const missingMarker = hook('pre-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-marker',
  tool_input: { subagent_type: 'enterprise-harness:code-explore', prompt: 'explore' },
});
assert.equal(missingMarker.status, 2);
assert.match(missingMarker.stderr, /EH-HANDOFF-INPUT-001/);

const execute = create('clarify', 'clarify.explore-code');
const executeMarker = path.relative(root, execute.path);
assert.equal(hook('pre-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-execute',
  session_id: 'session-1',
  tool_input: {
    subagent_type: 'enterprise-harness:code-explore',
    prompt: `HANDOFF_INPUT=${executeMarker}\nExplore the fixture.`,
  },
}).status, 0);

assert.equal(hook('subagent-start.mjs', {
  hook_event_name: 'SubagentStart',
  session_id: 'session-1',
  agent_id: 'agent-execute',
  agent_type: 'enterprise-harness:code-explore',
}).status, 0);

const malformed = hook('subagent-stop.mjs', {
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-execute',
  agent_type: 'enterprise-harness:code-explore',
  last_assistant_message: 'done',
  stop_hook_active: false,
});
assert.equal(malformed.status, 0);
assert.equal(JSON.parse(malformed.stdout).decision, 'block');
assert.match(JSON.parse(malformed.stdout).reason, /EH-SUBAGENT-RESULT-004/);

const validExecuteStop = hook('subagent-stop.mjs', {
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-execute',
  agent_type: 'enterprise-harness:code-explore',
  last_assistant_message: resultBlock(execute.envelope),
  stop_hook_active: false,
});
assert.equal(validExecuteStop.status, 0, validExecuteStop.stderr);
assert.equal(validExecuteStop.stdout.trim(), '');

const postExecute = hook('post-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-execute',
  session_id: 'session-1',
  tool_input: {
    subagent_type: 'enterprise-harness:code-explore',
    prompt: `HANDOFF_INPUT=${executeMarker}`,
  },
  tool_response: { agentId: 'agent-execute' },
});
assert.equal(postExecute.status, 0, postExecute.stderr);
assert.ok(completedHarnessAgent(root, changeId, 'agent-execute', 'enterprise-harness:code-explore'));
const prematureComplete = hook('task-completed.mjs', {
  hook_event_name: 'TaskCompleted',
  session_id: 'session-1',
});
assert.equal(prematureComplete.status, 0, prematureComplete.stderr);
assert.equal(prematureComplete.stderr, '');

const check = create('clarify', 'clarify.explore-code', 'check', execute.envelope.runId);
const checkMarker = path.relative(root, check.path);
assert.equal(hook('pre-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-check',
  session_id: 'session-1',
  tool_input: {
    subagent_type: 'enterprise-harness:clarify-reviewer',
    prompt: `HANDOFF_INPUT=${checkMarker}\nCheck the executor result.`,
  },
}).status, 0);
assert.equal(hook('subagent-start.mjs', {
  hook_event_name: 'SubagentStart',
  session_id: 'session-1',
  agent_id: 'agent-check',
  agent_type: 'enterprise-harness:clarify-reviewer',
}).status, 0);
assert.equal(hook('subagent-stop.mjs', {
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-check',
  agent_type: 'enterprise-harness:clarify-reviewer',
  last_assistant_message: resultBlock(check.envelope, { verdict: 'pass' }),
  stop_hook_active: false,
}).status, 0);
assert.equal(hook('post-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-check',
  session_id: 'session-1',
  tool_input: {
    subagent_type: 'enterprise-harness:clarify-reviewer',
    prompt: `HANDOFF_INPUT=${checkMarker}`,
  },
  tool_response: { agentId: 'agent-check' },
}).status, 0);

const taskComplete = hook('task-completed.mjs', {
  hook_event_name: 'TaskCompleted',
  session_id: 'session-1',
});
assert.equal(taskComplete.status, 0, taskComplete.stderr);

const events = readAgentEvents(root, changeId);
assert.ok(events.some((event) => event.kind === 'dispatch' && event.runId === execute.envelope.runId));
assert.ok(events.some((event) => event.kind === 'stop' && event.runId === check.envelope.runId && event.verdict === 'pass'));
assert.ok(fs.existsSync(path.join(root, 'harness/changes', changeId, 'runs', execute.envelope.runId, 'result.json')));
assert.ok(fs.existsSync(path.join(root, 'harness/changes', changeId, 'runs', check.envelope.runId, 'check.json')));

fs.rmSync(root, { recursive: true, force: true });
console.log(`PASS agent-lifecycle-hook ${process.argv[2] || 'verify'}`);
