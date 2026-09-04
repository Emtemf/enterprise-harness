import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { preWrite } from '../lib/hooks/pre-write.mjs';
import { bindSession } from '../lib/sessions.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-skill-script-hook-'));
const changeId = 'skill-script-hook';
const sessionId = 'skill-script-session';
const agentId = 'design-worker-1';

function invoke(command, id, overrides = {}) {
  return preWrite({
    root,
    event: {
      tool_name: 'Bash',
      tool_use_id: id,
      cwd: root,
      session_id: sessionId,
      agent_id: agentId,
      tool_input: { command },
      ...overrides,
    },
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: {},
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    subjectRoot: root,
    controllerRevision: 'test',
  });
  appendAgentEvent(root, changeId, {
    kind: 'dispatch',
    sessionId,
    toolUseId: 'skill-call',
    requestedAgentType: 'enterprise-harness:artifact-worker',
    runId: 'run_11111111-1111-4111-8111-111111111111',
    behavior: 'design.produce',
    handoffRole: 'execute',
    preloadedSkill: 'design',
    issuedAt: '2026-09-02T00:00:00.000Z',
  });
  appendAgentEvent(root, changeId, {
    kind: 'start',
    sessionId,
    agentId,
    observedAgentType: 'enterprise-harness:artifact-worker',
    issuedAt: '2026-09-02T00:00:01.000Z',
  });

  for (const [index, relative] of [
    ['skills/design/scripts/prepare-input.mjs', 'HANDOFF_INPUT=.git/enterprise-harness/runs/skill-script-hook/run_11111111-1111-4111-8111-111111111111/input.json'],
    ['skills/design/scripts/finalize-result.mjs', 'skill-script-hook run_11111111-1111-4111-8111-111111111111'],
  ].entries()) {
    const result = invoke(`node "${path.join(sourceRoot, relative[0])}" ${relative[1]}`, `matching-${index}`);
    assert.equal(result.exitCode, 0, `matching forked Skill must run ${relative}: ${result.stderr || ''}`);
  }

  const diagnosticMerge = invoke(
    `node "${path.join(sourceRoot, 'skills/design/scripts/prepare-input.mjs')}" HANDOFF_INPUT=.git/enterprise-harness/runs/skill-script-hook/run_11111111-1111-4111-8111-111111111111/input.json 2>&1`,
    'diagnostic-merge',
  );
  assert.equal(diagnosticMerge.exitCode, 0, 'a terminal stderr-to-stdout merge must not turn a trusted supporting script into arbitrary Bash');

  const pipedScript = invoke(
    `node "${path.join(sourceRoot, 'skills/design/scripts/prepare-input.mjs')}" HANDOFF_INPUT=.git/enterprise-harness/runs/skill-script-hook/run_11111111-1111-4111-8111-111111111111/input.json 2>&1 | head -1`,
    'piped-script',
  );
  assert.equal(pipedScript.exitCode, 2, 'pipelines around a supporting script remain denied');
  assert.match(pipedScript.stderr, /EH-HOOK-BASH-MUTATION-157/u);

  const wrongRun = invoke(
    `node "${path.join(sourceRoot, 'skills/design/scripts/finalize-result.mjs')}" ${changeId} run_22222222-2222-4222-8222-222222222222`,
    'wrong-run',
  );
  assert.equal(wrongRun.exitCode, 2);
  assert.match(wrongRun.stderr, /EH-HOOK-SKILL-SCRIPT-159/u);

  const wrongSkill = invoke(
    `node "${path.join(sourceRoot, 'skills/plan/scripts/prepare-input.mjs')}" fixture-argument`,
    'wrong-skill',
  );
  assert.equal(wrongSkill.exitCode, 2);
  assert.match(wrongSkill.stderr, /EH-HOOK-SKILL-SCRIPT-159/u);

  const mainImpersonation = invoke(
    `node "${path.join(sourceRoot, 'skills/design/scripts/finalize-result.mjs')}" fixture-argument`,
    'main-impersonation',
    { agent_id: '' },
  );
  assert.equal(mainImpersonation.exitCode, 2);
  assert.match(mainImpersonation.stderr, /EH-HOOK-SKILL-SCRIPT-159/u);

  const arbitrary = invoke(`node "${path.join(sourceRoot, 'skills/design/assert/artifact-shape.mjs')}"`, 'arbitrary');
  assert.equal(arbitrary.exitCode, 2, 'only declared supporting script entrypoints may execute');
  assert.match(arbitrary.stderr, /EH-HOOK-BASH-MUTATION-157/u);

  const implementRunId = 'run_33333333-3333-4333-8333-333333333333';
  const implementAgentId = 'implementer-1';
  const state = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    ...state,
    stage: 'implement',
    currentTask: 'task-one',
  }, null, 2)}\n`);
  appendAgentEvent(root, changeId, {
    kind: 'dispatch', sessionId, toolUseId: 'implement-skill-call',
    requestedAgentType: 'enterprise-harness:implementer', runId: implementRunId,
    behavior: 'implement.execute-task', handoffRole: 'execute', preloadedSkill: 'implement',
    issuedAt: '2026-09-02T00:00:02.000Z',
  });
  appendAgentEvent(root, changeId, {
    kind: 'start', sessionId, agentId: implementAgentId,
    observedAgentType: 'enterprise-harness:implementer', issuedAt: '2026-09-02T00:00:03.000Z',
  });
  const implementFinalize = invoke(
    `node "${path.join(sourceRoot, 'skills/implement/scripts/finalize-result.mjs')}" ${changeId} task-one ${implementRunId}`,
    'implement-finalize',
    { agent_id: implementAgentId },
  );
  assert.equal(implementFinalize.exitCode, 0, `Implement finalizer runId is its third argument: ${implementFinalize.stderr || ''}`);

  console.log(`PASS skill-script-hook ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
