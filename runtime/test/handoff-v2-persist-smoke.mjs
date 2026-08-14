import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const handoffCli = path.join(sourceRoot, 'runtime', 'handoff.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-handoff-persist-'));
const changeId = 'persist-result';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;

function persist(runId, source) {
  return spawnSync(process.execPath, [handoffCli, 'persist', changeId, runId, source], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- Persist result\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');
  const tecpc = { target: 'persist design result', evidence: [designRef], context: [requirementsRef], path: designRef, correction: null };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design',
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
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(path.join(root, 'stage-result.json'), JSON.stringify(stageResult));

  const persistedStage = persist(execute.runId, 'stage-result.json');
  assert.equal(persistedStage.status, 0, persistedStage.stderr || persistedStage.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, execute.runId), 'utf-8')), stageResult);

  const duplicate = persist(execute.runId, 'stage-result.json');
  assert.equal(duplicate.status, 2);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /already exists/u);

  const check = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    tecpc,
  });
  const invalidReview = { ...stageResult, type: 'review-result', runId: check.runId };
  fs.writeFileSync(path.join(root, 'invalid-review.json'), JSON.stringify(invalidReview));
  const rejected = persist(check.runId, 'invalid-review.json');
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
  const persistedReview = persist(check.runId, 'review-result.json');
  assert.equal(persistedReview.status, 0, persistedReview.stderr || persistedReview.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, check.runId, 'check'), 'utf-8')), review);

  const explore = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'code-explore' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  const packet = {
    packetVersion: 1,
    type: 'research-packet',
    changeId,
    source: 'code-explore',
    facts: [{ claim: 'design artifact is present', sources: [designRef] }],
    inputRefs: [requirementsRef],
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    collectedAt: '2026-08-14T00:00:02.000Z',
  };
  fs.writeFileSync(path.join(root, 'research-packet.json'), JSON.stringify(packet));
  const persistedPacket = persist(explore.runId, 'research-packet.json');
  assert.equal(persistedPacket.status, 0, persistedPacket.stderr || persistedPacket.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, explore.runId), 'utf-8')), packet);

  console.log(`PASS handoff-v2-persist ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
