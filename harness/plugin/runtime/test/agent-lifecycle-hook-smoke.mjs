import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  completedHarnessAgent,
  normalizeAgentType,
  readAgentEvents,
  receiptSpoolPath,
  startedHarnessAgent,
} from '../lib/agent-evidence.mjs';

const sourceRoot = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-agent-hooks-'));
const changeId = 'agent-hook-probe';
fs.mkdirSync(path.join(root, 'harness/changes', changeId), { recursive: true });
fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
fs.writeFileSync(path.join(root, 'harness/changes', changeId, 'state.json'), `${JSON.stringify({ changeId })}\n`);
fs.mkdirSync(path.join(root, 'harness/plugin/runtime/test'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs'),
  'process.exit(1);\n',
);
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
};
git('init', '-q');
git('config', 'user.email', 'harness@example.invalid');
git('config', 'user.name', 'Harness Smoke');
git('add', '.');
git('commit', '-qm', 'baseline');

function hook(script, payload) {
  return spawnSync('node', [path.join(sourceRoot, 'harness/plugin/runtime/hooks', script)], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    shell: false,
  });
}

for (const script of ['pre-agent.mjs', 'post-agent.mjs', 'subagent-start.mjs', 'subagent-stop.mjs']) {
  assert.equal(fs.existsSync(path.join(sourceRoot, 'harness/plugin/runtime/hooks', script)), true, script);
}
assert.equal(normalizeAgentType('code-explore'), 'enterprise-harness:code-explore');
assert.equal(
  normalizeAgentType('enterprise-harness:tdd-executor'),
  'enterprise-harness:tdd-executor',
);
assert.match(receiptSpoolPath(root, 'probe'), /enterprise-harness/);

const custom = hook('pre-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-custom',
  session_id: 'session-1',
  tool_input: { subagent_type: 'project-owned-agent' },
});
assert.equal(custom.status, 0, 'unknown project-owned agents remain outside harness policy');

const bare = hook('pre-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-bare',
  session_id: 'session-1',
  tool_input: { subagent_type: 'code-explore' },
});
assert.equal(bare.status, 2, 'known bare subtype must be rejected');

const missingBinding = hook('post-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-missing-agent',
  session_id: 'session-1',
  tool_input: { subagent_type: 'enterprise-harness:tdd-executor' },
  tool_response: { async_launched: true },
});
assert.equal(missingBinding.status, 2, 'a harness dispatch without agentId must not be guessed');

for (const [toolUseId, type] of [
  ['tool-a', 'enterprise-harness:code-explore'],
  ['tool-b', 'enterprise-harness:tdd-executor'],
]) {
  assert.equal(hook('pre-agent.mjs', {
    tool_name: 'Agent',
    tool_use_id: toolUseId,
    session_id: 'session-1',
    tool_input: { subagent_type: type },
  }).status, 0);
}
assert.equal(hook('subagent-start.mjs', {
  hook_event_name: 'SubagentStart',
  session_id: 'session-1',
  agent_id: 'agent-a',
  agent_type: 'enterprise-harness:code-explore',
}).status, 0);
assert.equal(hook('subagent-start.mjs', {
  hook_event_name: 'SubagentStart',
  session_id: 'session-1',
  agent_id: 'agent-b',
  agent_type: 'enterprise-harness:tdd-executor',
}).status, 0);
assert.ok(
  startedHarnessAgent(root, changeId, 'agent-b', 'enterprise-harness:tdd-executor'),
  'trusted Start identity authorizes a foreground executor',
);
assert.equal(
  completedHarnessAgent(root, changeId, 'agent-b', 'enterprise-harness:tdd-executor'),
  null,
  'completion still requires the Post Agent binding',
);
const foregroundRun = spawnSync('node', [
  path.join(sourceRoot, 'harness/plugin/runtime/tdd-run.mjs'),
  changeId,
  'task-2',
  'red',
  '--',
  'node',
  'harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs',
  'red',
], {
  cwd: root,
  encoding: 'utf-8',
  env: { ...process.env, HARNESS_TDD_EXECUTOR_ID: 'agent-b' },
  shell: false,
});
assert.equal(foregroundRun.status, 1, foregroundRun.stderr);
assert.match(foregroundRun.stdout, /TDD_RECEIPT=/);
// Complete in reverse order to prove correlation uses tool_use_id, not "most recent agent".
assert.equal(hook('post-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-b',
  session_id: 'session-1',
  tool_input: { subagent_type: 'enterprise-harness:tdd-executor' },
  tool_response: { agentId: 'agent-b' },
}).status, 0);
assert.equal(
  completedHarnessAgent(root, changeId, 'agent-b', 'enterprise-harness:tdd-executor'),
  null,
  'binding without a structured Stop is not completion evidence',
);
assert.equal(hook('post-agent.mjs', {
  tool_name: 'Agent',
  tool_use_id: 'tool-a',
  session_id: 'session-1',
  tool_input: { subagent_type: 'enterprise-harness:code-explore' },
  tool_response: { agentId: 'agent-a' },
}).status, 0);

const events = readAgentEvents(root, changeId);
const bindings = events.filter((event) => event.kind === 'dispatch-binding');
assert.equal(bindings.find((event) => event.toolUseId === 'tool-a')?.agentId, 'agent-a');
assert.equal(bindings.find((event) => event.toolUseId === 'tool-b')?.agentId, 'agent-b');
assert.equal(
  events.find((event) => event.kind === 'start' && event.agentId === 'agent-a')?.rawObservedAgentType,
  'enterprise-harness:code-explore',
  'normalization must preserve the observed value',
);

const validStop = hook('subagent-stop.mjs', {
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-a',
  agent_type: 'enterprise-harness:code-explore',
  last_assistant_message: [
    '## Exploration Packet',
    '### Scope',
    'business code',
    '### CodeGraph',
    'attempted',
    '### Findings',
    'one finding',
    '### Evidence',
    'one path',
  ].join('\n'),
  stop_hook_active: false,
});
assert.equal(validStop.status, 0);
assert.equal(validStop.stdout.trim(), '');

const validTddStop = hook('subagent-stop.mjs', {
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-b',
  agent_type: 'enterprise-harness:tdd-executor',
  last_assistant_message: [
    'task-id: task-2',
    'worktree: /tmp/probe',
    'receipt: task-2.json',
    'commit: abcdef1',
    'RED GREEN REFACTOR',
  ].join('\n'),
  stop_hook_active: false,
});
assert.equal(validTddStop.status, 0);
assert.ok(
  completedHarnessAgent(root, changeId, 'agent-b', 'enterprise-harness:tdd-executor'),
);

const malformedStop = hook('subagent-stop.mjs', {
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-b',
  agent_type: 'enterprise-harness:tdd-executor',
  last_assistant_message: 'done',
  stop_hook_active: false,
});
assert.equal(malformedStop.status, 0);
assert.equal(JSON.parse(malformedStop.stdout).decision, 'block');
const recursiveStop = hook('subagent-stop.mjs', {
  hook_event_name: 'SubagentStop',
  session_id: 'session-1',
  agent_id: 'agent-b',
  agent_type: 'enterprise-harness:tdd-executor',
  last_assistant_message: 'done',
  stop_hook_active: true,
});
assert.equal(recursiveStop.status, 0);
assert.equal(recursiveStop.stdout.trim(), '');
assert.equal(
  readAgentEvents(root, changeId).some((event) => (
    event.kind === 'violation'
    && event.agentId === 'agent-b'
    && event.violation === 'malformed-subagent-result'
  )),
  true,
);
console.log(`PASS agent-lifecycle-hook ${process.argv[2] || 'verify'}`);
