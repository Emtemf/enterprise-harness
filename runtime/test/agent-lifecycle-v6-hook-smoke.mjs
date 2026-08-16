import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, persistHandoffV2Result } from '../core/handoff-v2.mjs';
import { trustedHandoffAgentBindings } from '../lib/agent-evidence.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { bindSession } from '../lib/sessions.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-v6-agent-hooks-'));
const changeId = 'v6-agent-hook';
const sessionId = 'v6-agent-session';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;

function hook(script, payload) {
  return spawnSync(process.execPath, [path.join(sourceRoot, 'hooks', 'scripts', script)], {
    cwd: root,
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    shell: false,
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification: null },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- V6 hook binding\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    controllerRevision: 'test-controller',
  }, { commonDir: path.join(root, '.git') });

  const tecpc = {
    target: 'bind v6 artifact worker',
    evidence: [designRef],
    context: [requirementsRef],
    path: designRef,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  const marker = path.relative(root, execute.path);
  assert.equal(hook('pre-agent.mjs', {
    tool_name: 'Agent',
    tool_use_id: 'tool-v6-execute',
    session_id: sessionId,
    tool_input: {
      subagent_type: 'enterprise-harness:artifact-worker',
      prompt: `HANDOFF_INPUT=${marker}\nProduce design.`,
    },
  }).status, 0);
  assert.equal(hook('subagent-start.mjs', {
    hook_event_name: 'SubagentStart',
    session_id: sessionId,
    agent_id: 'agent-v6-execute',
    agent_type: 'enterprise-harness:artifact-worker',
  }).status, 0);

  const artifacts = [{ path: designRef, digest: sha256Artifact(root, designRef) }];
  persistHandoffV2Result(root, changeId, execute.runId, {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts,
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-16T00:00:00.000Z',
  });

  const stopped = hook('subagent-stop.mjs', {
    hook_event_name: 'SubagentStop',
    session_id: sessionId,
    agent_id: 'agent-v6-execute',
    agent_type: 'enterprise-harness:artifact-worker',
    last_assistant_message: 'StageResult persisted through the v2 runtime.',
    stop_hook_active: false,
  });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(stopped.stdout.trim(), '');

  const posted = hook('post-agent.mjs', {
    tool_name: 'Agent',
    tool_use_id: 'tool-v6-execute',
    session_id: sessionId,
    tool_input: {
      subagent_type: 'enterprise-harness:artifact-worker',
      prompt: `HANDOFF_INPUT=${marker}`,
    },
    tool_response: { agentId: 'agent-v6-execute' },
  });
  assert.equal(posted.status, 0, posted.stderr);
  assert.equal(trustedHandoffAgentBindings(root, changeId, execute.input).length, 1);

  console.log(`PASS agent-lifecycle-v6-hook ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
