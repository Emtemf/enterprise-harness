import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, persistHandoffV2Result } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { writeCanonicalVerifyCompletionFixture } from './verify-completion-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lifecycle = path.join(sourceRoot, 'runtime', 'lifecycle.mjs');
const archiveFinalize = path.join(sourceRoot, 'skills', 'archive', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-lifecycle-archive-'));
const changeId = 'archive-transition';
const base = `harness/changes/${changeId}`;
const changeDir = path.join(root, base);
const {
  ENTERPRISE_HARNESS_SESSION_ID: _enterpriseHarnessSessionId,
  CLAUDE_SESSION_ID: _claudeSessionId,
  ...unboundEnv
} = process.env;

function runLifecycle(...args) {
  return spawnSync(process.execPath, [lifecycle, ...args], { cwd: root, encoding: 'utf-8', shell: false, env: unboundEnv });
}

function archiveStageResult(input, artifacts, completedAt) {
  return {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'archive',
    runId: input.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputDigests: { ...input.inputDigests },
    artifacts,
    assertions: [{ id: 'archive-complete', verdict: 'pass', evidence: artifacts.map((entry) => entry.path) }],
    selfCheck: { verdict: 'pass', findings: [], evidence: artifacts.map((entry) => entry.path) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt,
  };
}

function reviewResult(input, parent, reviewedAt) {
  return {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'archive',
    runId: input.runId,
    parentRunId: input.parentRunId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: input.parentRunId,
    reviewedArtifacts: parent.artifacts.map((entry) => ({ ...entry })),
    rubricIds: [...input.rubricIds],
    tecpc: { ...input.tecpc },
    verdict: 'pass',
    correction: null,
    reviewedAt,
  };
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, `${base}/test-cases.md`), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable | cleanup | accepted |',
  ].join('\n'));
  writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'verify' });
  const verify = writeCanonicalVerifyCompletionFixture(root, changeId);
  const statePath = path.join(changeDir, 'state.json');
  const initialState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  fs.writeFileSync(statePath, `${JSON.stringify({
    ...initialState,
    stage: 'verify',
    validation: { status: 'fresh', digest: sha256Artifact(root, verify.validationRef), validatedAt: '2026-08-29T00:00:06.000Z' },
  }, null, 2)}\n`);

  const enteredArchive = runLifecycle('archive', changeId);
  assert.equal(enteredArchive.status, 0, enteredArchive.stderr || enteredArchive.stdout);
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf-8')).stage, 'archive');

  const archiveRefs = [verify.validationRef, verify.verifyProofRef, verify.testCasesRef, verify.designProofRef];
  const archiveTecpc = {
    target: 'archive verified change', evidence: [verify.validationRef, verify.verifyProofRef],
    context: [verify.testCasesRef, verify.designProofRef], path: `${verify.validationRef} -> archive`, correction: null,
  };
  // Bypass-Skill RED: durable handoff/result/review identities alone must not
  // permit finalization without the runtime-owned manifest closure.
  const forgedExecute = createHandoffV2(root, {
    changeId, stage: 'archive', behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' }, inputRefs: archiveRefs, tecpc: archiveTecpc,
  });
  const forgedArtifacts = archiveRefs.map((artifactPath) => ({ path: artifactPath, digest: sha256Artifact(root, artifactPath) }));
  const forgedResult = archiveStageResult(forgedExecute.input, forgedArtifacts, '2026-08-29T00:00:07.000Z');
  persistHandoffV2Result(root, changeId, forgedExecute.runId, forgedResult);
  appendCompletedHandoffBinding(root, changeId, forgedExecute.input, { agentId: 'forged-archive-executor' });
  const forgedCheck = createHandoffV2(root, {
    changeId, stage: 'archive', behavior: 'review', role: 'check', parentRunId: forgedExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' }, inputRefs: archiveRefs, tecpc: archiveTecpc,
  });
  persistHandoffV2Result(root, changeId, forgedCheck.runId, reviewResult(forgedCheck.input, forgedResult, '2026-08-29T00:00:08.000Z'));
  appendCompletedHandoffBinding(root, changeId, forgedCheck.input, { agentId: 'forged-archive-reviewer' });
  const bypassRejected = runLifecycle('archive-finalize', changeId);
  assert.notEqual(bypassRejected.status, 0, 'Archive stage gate must reject a forged StageResult path that bypasses the Skill');
  assert.match(`${bypassRejected.stderr}\n${bypassRejected.stdout}`, /manifest|archive StageResult/u);

  const archiveExecute = createHandoffV2(root, {
    changeId, stage: 'archive', behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' }, inputRefs: archiveRefs, tecpc: archiveTecpc,
  });
  const finalizedWorker = spawnSync(process.execPath, [archiveFinalize, changeId, archiveExecute.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(finalizedWorker.status, 0, finalizedWorker.stderr || finalizedWorker.stdout);
  const archiveResult = JSON.parse(finalizedWorker.stdout);
  persistHandoffV2Result(root, changeId, archiveExecute.runId, archiveResult);
  appendCompletedHandoffBinding(root, changeId, archiveExecute.input, { agentId: 'archive-executor' });
  const archiveCheck = createHandoffV2(root, {
    changeId, stage: 'archive', behavior: 'review', role: 'check', parentRunId: archiveExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: archiveResult.artifacts.map((entry) => entry.path), tecpc: archiveTecpc,
  });
  persistHandoffV2Result(root, changeId, archiveCheck.runId, reviewResult(archiveCheck.input, archiveResult, '2026-08-29T00:00:10.000Z'));
  appendCompletedHandoffBinding(root, changeId, archiveCheck.input, { agentId: 'archive-reviewer' });

  const archiveRoot = path.join(root, 'harness', 'archive');
  fs.writeFileSync(archiveRoot, 'not-a-directory\n');
  const failedMove = runLifecycle('archive-finalize', changeId);
  assert.notEqual(failedMove.status, 0, 'archive-finalize must fail when archive root is not a directory');
  assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf-8')).lifecycle, 'active', 'failed archive move must roll lifecycle back');
  fs.rmSync(archiveRoot);

  const finalized = runLifecycle('archive-finalize', changeId);
  assert.equal(finalized.status, 0, finalized.stderr || finalized.stdout);
  assert.equal(fs.existsSync(changeDir), false);
  const archivedDir = path.join(root, 'harness', 'archive', changeId);
  assert.equal(JSON.parse(fs.readFileSync(path.join(archivedDir, 'state.json'), 'utf-8')).lifecycle, 'archived');
  assert.equal(fs.existsSync(path.join(archivedDir, 'evidence', 'completion', 'archive.json')), true);
  console.log(`PASS lifecycle-archive-transition ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
