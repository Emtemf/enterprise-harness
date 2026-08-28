import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, loadHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { appendAgentEvent, gitCommonDir } from '../lib/agent-evidence.mjs';
import { bindSession } from '../lib/sessions.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const handoffCli = path.join(sourceRoot, 'runtime', 'handoff.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-handoff-persist-'));
const changeId = 'persist-result';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const sessionId = 'handoff-persist-session';

function authorize(input, agentId) {
  const toolUseId = `tool-${input.runId}`;
  appendAgentEvent(root, changeId, {
    kind: 'dispatch',
    sessionId,
    toolUseId,
    requestedAgentType: input.agent.type,
    runId: input.runId,
    behavior: input.behavior,
    handoffRole: input.role,
    parentRunId: input.parentRunId,
    cwd: root,
  });
  appendAgentEvent(root, changeId, {
    kind: 'start',
    sessionId,
    agentId,
    observedAgentType: input.agent.type,
    cwd: root,
  });
}

function persist(runId, source, agentId) {
  return spawnSync(process.execPath, [handoffCli, 'persist', changeId, runId, source], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_SESSION_ID: sessionId,
      CLAUDE_SESSION_ID: undefined,
      CLAUDE_AGENT_ID: agentId,
    },
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification: null },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    controllerRevision: 'test-controller',
  }, { commonDir: path.join(root, '.git') });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- Persist result\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');
  const tecpc = { target: 'persist design result', evidence: [designRef], context: [requirementsRef], path: designRef, correction: null };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  const stageResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(path.join(root, 'stage-result.json'), JSON.stringify(stageResult));

  const unauthorizedStage = persist(execute.runId, 'stage-result.json', 'agent-reviewer');
  assert.equal(unauthorizedStage.status, 2);
  assert.match(`${unauthorizedStage.stdout}\n${unauthorizedStage.stderr}`, /EH-HANDOFF-AUTH-033/u);
  authorize(execute.input, 'agent-executor');
  const persistedStage = persist(execute.runId, 'stage-result.json', 'agent-executor');
  assert.equal(persistedStage.status, 0, persistedStage.stderr || persistedStage.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, execute.runId), 'utf-8')), stageResult);

  const duplicate = persist(execute.runId, 'stage-result.json', 'agent-executor');
  assert.equal(duplicate.status, 2);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /already exists/u);

  const check = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    tecpc,
  });
  const subagentCreatedCheck = spawnSync(process.execPath, [
    handoffCli,
    'create',
    changeId,
    'design',
    'design.review',
    'check',
    execute.runId,
    '--input-ref',
    designRef,
  ], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: {
      ...process.env,
      ENTERPRISE_HARNESS_SESSION_ID: sessionId,
      CLAUDE_AGENT_ID: 'agent-executor',
    },
  });
  assert.equal(subagentCreatedCheck.status, 2);
  assert.match(`${subagentCreatedCheck.stdout}\n${subagentCreatedCheck.stderr}`, /EH-HANDOFF-AUTH-032/u);
  authorize(check.input, 'agent-reviewer');
  const invalidReview = { ...stageResult, type: 'review-result', runId: check.runId };
  fs.writeFileSync(path.join(root, 'invalid-review.json'), JSON.stringify(invalidReview));
  const rejected = persist(check.runId, 'invalid-review.json', 'agent-reviewer');
  assert.equal(rejected.status, 2);
  assert.equal(fs.existsSync(v2ResultPath(root, changeId, check.runId, 'check')), false);

  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    rubricIds: ['design'],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-14T00:00:01.000Z',
  };
  fs.writeFileSync(path.join(root, 'review-result.json'), JSON.stringify(review));
  const persistedReview = persist(check.runId, 'review-result.json', 'agent-reviewer');
  assert.equal(persistedReview.status, 0, persistedReview.stderr || persistedReview.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, check.runId, 'check'), 'utf-8')), review);

  const explore = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  const packet = {
    packetVersion: 1,
    type: 'research-packet',
    changeId,
    source: 'code-explore',
    question: 'Is the design artifact present?',
    scope: ['harness/changes/persist-result'],
    facts: [{ claim: 'design artifact is present', sources: [designRef] }],
    uncertainties: [],
    authority: 'codegraph-first',
    fallback: null,
    degraded: false,
    recommendedDecision: null,
    inputRefs: [requirementsRef],
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    collectedAt: '2026-08-14T00:00:02.000Z',
  };
  fs.writeFileSync(path.join(root, 'research-packet.json'), JSON.stringify(packet));
  authorize(explore.input, 'agent-explorer');
  const persistedPacket = persist(explore.runId, 'research-packet.json', 'agent-explorer');
  assert.equal(persistedPacket.status, 0, persistedPacket.stderr || persistedPacket.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, explore.runId), 'utf-8')), packet);

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-handoff-outside-'));
  const commonRuns = path.join(gitCommonDir(root), 'enterprise-harness', 'runs', changeId);
  const escapedRunId = 'run_00000000-0000-4000-8000-000000000001';
  fs.mkdirSync(commonRuns, { recursive: true });
  fs.symlinkSync(outside, path.join(commonRuns, escapedRunId), 'dir');
  assert.throws(
    () => loadHandoffV2(root, changeId, escapedRunId),
    /outside|escapes|safe/u,
    'a v2 run symlink escaping the common directory must be rejected',
  );
  fs.rmSync(outside, { recursive: true, force: true });

  console.log(`PASS handoff-v2-persist ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
