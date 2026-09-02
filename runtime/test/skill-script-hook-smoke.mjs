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

  console.log(`PASS skill-script-hook ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
