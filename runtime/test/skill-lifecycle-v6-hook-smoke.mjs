import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { readAgentEvents, trustedHandoffAgentBindings } from '../lib/agent-evidence.mjs';
import { bindSession } from '../lib/sessions.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-v6-skill-hooks-'));
const changeId = 'v6-skill-hook';
const sessionId = 'v6-skill-session';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;

function hook(script, payload) {
  return spawnSync(process.execPath, [path.join(sourceRoot, 'hooks', 'scripts', script)], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    shell: false,
  });
}

function packetFor(input) {
  return {
    packetVersion: 1,
    type: 'research-packet',
    changeId,
    source: 'code-explore',
    question: 'What does greeting return?',
    scope: ['src/greeting.mjs'],
    facts: [{
      claim: 'greeting returns a hello string containing the supplied name.',
      sources: ['src/greeting.mjs'],
    }],
    uncertainties: [],
    authority: 'codegraph-first',
    fallback: null,
    degraded: false,
    recommendedDecision: null,
    inputRefs: [...input.inputRefs],
    inputDigests: { ...input.inputDigests },
    collectedAt: '2026-08-31T00:00:00.000Z',
  };
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'greeting.mjs'), 'export const greeting = (name) => `hello, ${name}`;\n');
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\nConfirm greeting behavior.\n');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: null },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    controllerRevision: 'test-controller',
  }, { commonDir: path.join(root, '.git') });

  for (const script of ['pre-agent.mjs', 'post-agent.mjs', 'agent-failure.mjs']) {
    const mainEntry = hook(script, {
      tool_name: 'Skill',
      tool_use_id: `tool-main-${script}`,
      session_id: sessionId,
      tool_input: {
        skill: 'enterprise-harness:harness',
        args: '用户的原始需求，不是 fork handoff marker。',
      },
    });
    assert.equal(mainEntry.status, 0, `${script} must not govern the Harness controller Skill`);
    assert.equal(mainEntry.stdout.trim(), '');
    assert.equal(mainEntry.stderr.trim(), '');
  }

  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: [requirementsRef],
    tecpc: {
      target: 'Establish greeting behavior before asking the user',
      evidence: [requirementsRef],
      context: ['src/greeting.mjs'],
      path: 'Clarify code fact lane',
      correction: null,
    },
  });
  const marker = path.relative(root, handoff.path);
  const skillInput = {
    skill: 'enterprise-harness:explore-code',
    args: `HANDOFF_INPUT=${marker}`,
  };

  const polluted = hook('pre-agent.mjs', {
    tool_name: 'Skill',
    tool_use_id: 'tool-skill-polluted',
    session_id: sessionId,
    tool_input: { ...skillInput, args: `${skillInput.args}\nExplore greeting.` },
  });
  assert.equal(polluted.status, 2, polluted.stderr || polluted.stdout);
  assert.match(`${polluted.stdout}\n${polluted.stderr}`, /EH-HANDOFF-INPUT-001/u);

  const wrongSkill = hook('pre-agent.mjs', {
    tool_name: 'Skill',
    tool_use_id: 'tool-skill-wrong',
    session_id: sessionId,
    tool_input: { ...skillInput, skill: 'enterprise-harness:research-docs' },
  });
  assert.equal(wrongSkill.status, 2, wrongSkill.stderr || wrongSkill.stdout);
  assert.match(`${wrongSkill.stdout}\n${wrongSkill.stderr}`, /EH-HANDOFF-SCHEMA-002/u);

  const dispatched = hook('pre-agent.mjs', {
    tool_name: 'Skill',
    tool_use_id: 'tool-skill-execute',
    session_id: sessionId,
    tool_input: skillInput,
  });
  assert.equal(dispatched.status, 0, dispatched.stderr || dispatched.stdout);
  assert.ok(readAgentEvents(root, changeId).some((event) => (
    event.kind === 'dispatch'
      && event.toolUseId === 'tool-skill-execute'
      && event.requestedAgentType === 'enterprise-harness:code-explore'
  )));

  assert.equal(hook('subagent-start.mjs', {
    hook_event_name: 'SubagentStart',
    session_id: sessionId,
    agent_id: 'agent-skill-execute',
    agent_type: 'enterprise-harness:code-explore',
  }).status, 0);

  const stopped = hook('subagent-stop.mjs', {
    hook_event_name: 'SubagentStop',
    session_id: sessionId,
    agent_id: 'agent-skill-execute',
    agent_type: 'enterprise-harness:code-explore',
    last_assistant_message: JSON.stringify(packetFor(handoff.input)),
    stop_hook_active: false,
  });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(stopped.stdout.trim(), '');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, handoff.runId), 'utf-8')),
    packetFor(handoff.input),
  );

  const posted = hook('post-agent.mjs', {
    tool_name: 'Skill',
    tool_use_id: 'tool-skill-execute',
    session_id: sessionId,
    tool_input: skillInput,
    tool_response: {
      success: true,
      commandName: 'enterprise-harness:explore-code',
      status: 'forked',
      agentId: 'agent-skill-execute',
    },
  });
  assert.equal(posted.status, 0, posted.stderr || posted.stdout);
  assert.equal(trustedHandoffAgentBindings(root, changeId, handoff.input).length, 1);

  const failedHandoff = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: [requirementsRef],
    tecpc: {
      target: 'Exercise Skill failure recovery',
      evidence: [requirementsRef],
      context: ['src/greeting.mjs'],
      path: 'Clarify code fact lane retry',
      correction: null,
    },
  });
  const failedMarker = path.relative(root, failedHandoff.path);
  assert.equal(hook('pre-agent.mjs', {
    tool_name: 'Skill',
    tool_use_id: 'tool-skill-failed',
    session_id: sessionId,
    tool_input: {
      skill: 'enterprise-harness:explore-code',
      args: `HANDOFF_INPUT=${failedMarker}`,
    },
  }).status, 0);
  const failed = hook('agent-failure.mjs', {
    tool_name: 'Skill',
    tool_use_id: 'tool-skill-failed',
    session_id: sessionId,
    tool_input: {
      skill: 'enterprise-harness:explore-code',
      args: `HANDOFF_INPUT=${failedMarker}`,
    },
    error: 'forked skill failed',
  });
  assert.equal(failed.status, 0, failed.stderr || failed.stdout);
  assert.ok(readAgentEvents(root, changeId).some((event) => (
    event.kind === 'failure'
      && event.toolUseId === 'tool-skill-failed'
      && event.runId === failedHandoff.runId
      && event.requestedAgentType === 'enterprise-harness:code-explore'
  )));

  console.log(`PASS skill-lifecycle-v6-hook ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
