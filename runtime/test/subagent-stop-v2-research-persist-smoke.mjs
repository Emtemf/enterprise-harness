import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { appendAgentEvent, readAgentEvents } from '../lib/agent-evidence.mjs';
import { subagentStop } from '../lib/hooks/subagent-stop.mjs';
import { bindSession } from '../lib/sessions.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-v2-research-stop-'));
const changeId = 'research-stop-persist';
const sessionId = 'research-stop-session';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;

function authorize(input, agentId, toolUseId, includeStart = true) {
  appendAgentEvent(root, changeId, {
    kind: 'dispatch',
    sessionId,
    toolUseId,
    requestedAgentType: input.agent.type,
    runId: input.runId,
    behavior: input.behavior,
    handoffRole: input.role,
    handoffPath: null,
    parentRunId: input.parentRunId,
    cwd: root,
  });
  if (includeStart) {
    appendAgentEvent(root, changeId, {
      kind: 'start',
      sessionId,
      agentId,
      observedAgentType: input.agent.type,
      cwd: root,
    });
  }
}

function packetFor(input, source = 'code-explore') {
  return {
    packetVersion: 1,
    type: 'research-packet',
    changeId,
    source,
    question: 'Which existing symbols and rules constrain cancellation?',
    scope: ['OrderService cancellation behavior'],
    facts: [{
      claim: 'The requirements artifact defines the cancellation investigation boundary.',
      sources: [requirementsRef],
    }],
    uncertainties: [],
    authority: source === 'code-explore' ? 'codegraph-first' : 'context7-first',
    fallback: null,
    degraded: false,
    recommendedDecision: null,
    inputRefs: [...input.inputRefs],
    inputDigests: { ...input.inputDigests },
    collectedAt: '2026-08-21T00:00:00.000Z',
  };
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\nInvestigate cancellation.\n');
  fs.writeFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: null },
  })}\n`);
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    controllerRevision: 'test-controller',
  }, { commonDir: path.join(root, '.git') });

  const createResearch = (behavior, agent) => createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior,
    agent,
    inputRefs: [requirementsRef],
    tecpc: {
      target: 'Resolve cancellation facts before interviewing the user',
      evidence: [requirementsRef],
      context: [requirementsRef],
      path: 'clarify fact lane',
      correction: null,
    },
  });

  const explore = createResearch('clarify.explore-code', {
    type: 'enterprise-harness:code-explore',
    skill: 'explore-code',
  });
  authorize(explore.input, 'agent-code', 'tool-code');
  const validStop = subagentStop({
    root,
    event: {
      hook_event_name: 'SubagentStop',
      session_id: sessionId,
      agent_id: 'agent-code',
      agent_type: 'enterprise-harness:code-explore',
      last_assistant_message: JSON.stringify(packetFor(explore.input)),
      stop_hook_active: false,
      cwd: root,
    },
  });
  assert.equal(validStop.exitCode, 0);
  assert.equal(validStop.stdout ?? '', '');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, explore.runId), 'utf-8')),
    packetFor(explore.input),
  );
  assert.ok(readAgentEvents(root, changeId).some((event) => (
    event.kind === 'stop' && event.runId === explore.runId && event.agentId === 'agent-code'
  )));

  const docs = createResearch('clarify.research-docs', {
    type: 'enterprise-harness:doc-research',
    skill: 'research-docs',
  });
  authorize(docs.input, 'agent-docs', 'tool-docs');
  const invalidStop = subagentStop({
    root,
    event: {
      hook_event_name: 'SubagentStop',
      session_id: sessionId,
      agent_id: 'agent-docs',
      agent_type: 'enterprise-harness:doc-research',
      last_assistant_message: JSON.stringify(packetFor(docs.input, 'code-explore')),
      stop_hook_active: false,
      cwd: root,
    },
  });
  assert.equal(invalidStop.exitCode, 0);
  assert.equal(JSON.parse(invalidStop.stdout).decision, 'block');
  assert.match(JSON.parse(invalidStop.stdout).reason, /EH-SUBAGENT-RESULT-004/u);
  assert.equal(fs.existsSync(v2ResultPath(root, changeId, docs.runId)), false);

  const prePersisted = createResearch('clarify.explore-code', {
    type: 'enterprise-harness:code-explore',
    skill: 'explore-code',
  });
  const prePersistedPacket = packetFor(prePersisted.input);
  persistHandoffV2Result(root, changeId, prePersisted.runId, prePersistedPacket);
  authorize(prePersisted.input, 'agent-pre-persisted', 'tool-pre-persisted');
  const prePersistedStop = subagentStop({
    root,
    event: {
      hook_event_name: 'SubagentStop',
      session_id: sessionId,
      agent_id: 'agent-pre-persisted',
      agent_type: 'enterprise-harness:code-explore',
      last_assistant_message: JSON.stringify(prePersistedPacket),
      stop_hook_active: false,
      cwd: root,
    },
  });
  assert.equal(JSON.parse(prePersistedStop.stdout).decision, 'block');
  assert.match(JSON.parse(prePersistedStop.stdout).reason, /pre-existing research result/u);
  assert.equal(readAgentEvents(root, changeId).some((event) => (
    event.kind === 'stop' && event.runId === prePersisted.runId
  )), false);
  appendAgentEvent(root, changeId, {
    kind: 'failure',
    sessionId,
    toolUseId: 'tool-pre-persisted',
    requestedAgentType: prePersisted.input.agent.type,
    runId: prePersisted.runId,
    behavior: prePersisted.input.behavior,
    cwd: root,
  });

  const failed = createResearch('clarify.explore-code', {
    type: 'enterprise-harness:code-explore',
    skill: 'explore-code',
  });
  authorize(failed.input, 'agent-failed', 'tool-failed', false);
  appendAgentEvent(root, changeId, {
    kind: 'failure',
    sessionId,
    toolUseId: 'tool-failed',
    requestedAgentType: failed.input.agent.type,
    runId: failed.runId,
    behavior: failed.input.behavior,
    cwd: root,
  });
  const retry = createResearch('clarify.explore-code', {
    type: 'enterprise-harness:code-explore',
    skill: 'explore-code',
  });
  authorize(retry.input, 'agent-retry', 'tool-retry');
  const retryStop = subagentStop({
    root,
    event: {
      hook_event_name: 'SubagentStop',
      session_id: sessionId,
      agent_id: 'agent-retry',
      agent_type: 'enterprise-harness:code-explore',
      last_assistant_message: JSON.stringify(packetFor(retry.input)),
      stop_hook_active: false,
      cwd: root,
    },
  });
  assert.equal(retryStop.stdout ?? '', '', 'a failed prior run must not make its retry ambiguous');
  assert.equal(fs.existsSync(v2ResultPath(root, changeId, retry.runId)), true);

  const unstarted = createResearch('clarify.explore-code', {
    type: 'enterprise-harness:code-explore',
    skill: 'explore-code',
  });
  authorize(unstarted.input, 'agent-unstarted', 'tool-unstarted', false);
  const unstartedStop = subagentStop({
    root,
    event: {
      hook_event_name: 'SubagentStop',
      session_id: sessionId,
      agent_id: 'agent-unstarted',
      agent_type: 'enterprise-harness:code-explore',
      last_assistant_message: JSON.stringify(packetFor(unstarted.input)),
      stop_hook_active: false,
      cwd: root,
    },
  });
  assert.equal(JSON.parse(unstartedStop.stdout).decision, 'block');
  assert.match(JSON.parse(unstartedStop.stdout).reason, /matching SubagentStart/u);
  assert.equal(fs.existsSync(v2ResultPath(root, changeId, unstarted.runId)), false);

  console.log(`PASS subagent-stop-v2-research-persist ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
