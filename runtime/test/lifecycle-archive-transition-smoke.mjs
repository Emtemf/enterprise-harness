import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lifecycle = path.join(sourceRoot, 'runtime', 'lifecycle.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-lifecycle-archive-'));
const changeId = ['archive', 'transition'].join('-');
const changeDir = path.join(root, 'harness', 'changes', changeId);
const validationRef = `harness/changes/${changeId}/validation.md`;
const verifyProofRef = `harness/changes/${changeId}/evidence/completion/verify.json`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
const archiveManifestRef = `harness/changes/${changeId}/evidence/archive-manifest.json`;
const {
  ENTERPRISE_HARNESS_SESSION_ID: _enterpriseHarnessSessionId,
  CLAUDE_SESSION_ID: _claudeSessionId,
  ...unboundEnv
} = process.env;

function runLifecycle(...args) {
  return spawnSync(process.execPath, [lifecycle, ...args], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: unboundEnv,
  });
}

function stageResult(input, stage, artifacts, completedAt) {
  return {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage,
    runId: input.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: stage },
    inputDigests: { ...input.inputDigests },
    artifacts,
    assertions: [{ id: `${stage}-complete`, verdict: 'pass', evidence: artifacts.map((artifact) => artifact.path) }],
    selfCheck: { verdict: 'pass', findings: [], evidence: artifacts.map((artifact) => artifact.path) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt,
  };
}

function reviewResult(input, parentResult, reviewedAt) {
  return {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: input.stage,
    runId: input.runId,
    parentRunId: input.parentRunId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: input.parentRunId,
    reviewedArtifacts: parentResult.artifacts.map((artifact) => ({ ...artifact })),
    rubricIds: [...input.rubricIds],
    tecpc: { ...input.tecpc },
    verdict: 'pass',
    correction: null,
    reviewedAt,
  };
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    decision: { tier: 'L1' },
  });
  fs.writeFileSync(path.join(root, validationRef), '# Validation\n\n## Commands\n- smoke\n\n## Results\n- pass\n\n## Freshness\n- fresh\n\n## Coverage and exceptions\n- none\n');
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'verify',
    artifacts: { classification },
    validation: { status: 'fresh', digest: 'a'.repeat(64), validatedAt: '2026-08-17T00:00:00.000Z' },
  }, null, 2)}\n`);

  const verifyTecpc = {
    target: 'verify completion',
    evidence: [validationRef],
    context: [validationRef],
    path: validationRef,
    correction: null,
  };
  const verifyExecute = createHandoffV2(root, {
    changeId,
    stage: 'verify',
    behavior: 'verify',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputRefs: [validationRef],
    tecpc: verifyTecpc,
  });
  const verifyArtifacts = [{ path: validationRef, digest: sha256Artifact(root, validationRef) }];
  const verifyResult = stageResult(verifyExecute.input, 'verify', verifyArtifacts, '2026-08-17T00:00:01.000Z');
  fs.writeFileSync(v2ResultPath(root, changeId, verifyExecute.runId), JSON.stringify(verifyResult));
  const verifyCheck = createHandoffV2(root, {
    changeId,
    stage: 'verify',
    behavior: 'review',
    role: 'check',
    parentRunId: verifyExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [validationRef],
    tecpc: verifyTecpc,
  });
  fs.writeFileSync(
    v2ResultPath(root, changeId, verifyCheck.runId, 'check'),
    JSON.stringify(reviewResult(verifyCheck.input, verifyResult, '2026-08-17T00:00:02.000Z')),
  );
  appendCompletedHandoffBinding(root, changeId, verifyExecute.input, { agentId: 'agent-verify' });
  appendCompletedHandoffBinding(root, changeId, verifyCheck.input, { agentId: 'agent-verify-review' });

  const enteredArchive = runLifecycle('archive', changeId);
  assert.equal(enteredArchive.status, 0, enteredArchive.stderr || enteredArchive.stdout);
  const archiveState = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  assert.equal(archiveState.stage, 'archive');
  assert.equal(archiveState.lifecycle, 'active');
  assert.equal(fs.existsSync(path.join(root, verifyProofRef)), true);
  assert.equal(fs.existsSync(path.join(root, 'harness', 'archive', changeId)), false);

  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n');
  fs.writeFileSync(path.join(root, designProofRef), JSON.stringify({
    type: 'completion-proof',
    stage: 'design',
    stageProofs: [{ kind: 'test-design', executionRunId: 'run_test-design-execute', reviewRunId: 'run_test-design-review' }],
  }));
  fs.writeFileSync(path.join(root, archiveManifestRef), JSON.stringify({
    manifestVersion: 1,
    changeId,
    testCases: { path: testCasesRef, digest: sha256Artifact(root, testCasesRef) },
    designProof: { path: designProofRef, digest: sha256Artifact(root, designProofRef) },
    testDesign: { executionRunId: 'run_test-design-execute', reviewRunId: 'run_test-design-review' },
  }));

  const archiveTecpc = {
    target: 'archive verified change',
    evidence: [validationRef, verifyProofRef, testCasesRef, designProofRef, archiveManifestRef],
    context: [verifyProofRef, designProofRef],
    path: `${validationRef} -> ${verifyProofRef} -> ${archiveManifestRef}`,
    correction: null,
  };
  const archiveExecute = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs: [validationRef, verifyProofRef, testCasesRef, designProofRef, archiveManifestRef],
    tecpc: archiveTecpc,
  });
  const archiveArtifacts = [validationRef, verifyProofRef, testCasesRef, designProofRef, archiveManifestRef]
    .map((artifactPath) => ({ path: artifactPath, digest: sha256Artifact(root, artifactPath) }));
  const archiveResult = stageResult(archiveExecute.input, 'archive', archiveArtifacts, '2026-08-17T00:00:03.000Z');
  fs.writeFileSync(v2ResultPath(root, changeId, archiveExecute.runId), JSON.stringify(archiveResult));
  const archiveCheck = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'review',
    role: 'check',
    parentRunId: archiveExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [validationRef, verifyProofRef, testCasesRef, designProofRef, archiveManifestRef],
    tecpc: archiveTecpc,
  });
  fs.writeFileSync(
    v2ResultPath(root, changeId, archiveCheck.runId, 'check'),
    JSON.stringify(reviewResult(archiveCheck.input, archiveResult, '2026-08-17T00:00:04.000Z')),
  );
  appendCompletedHandoffBinding(root, changeId, archiveExecute.input, { agentId: 'agent-archive' });
  appendCompletedHandoffBinding(root, changeId, archiveCheck.input, { agentId: 'agent-archive-review' });

  const archiveRoot = path.join(root, 'harness', 'archive');
  fs.writeFileSync(archiveRoot, 'not-a-directory\n');
  const failedMove = runLifecycle('archive-finalize', changeId);
  assert.notEqual(failedMove.status, 0, 'archive-finalize must fail when archive root is not a directory');
  assert.equal(fs.existsSync(changeDir), true);
  const rolledBackState = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  assert.equal(rolledBackState.lifecycle, 'active', 'failed archive move must roll lifecycle back');
  fs.rmSync(archiveRoot);

  const finalized = runLifecycle('archive-finalize', changeId);
  assert.equal(finalized.status, 0, finalized.stderr || finalized.stdout);
  assert.equal(fs.existsSync(changeDir), false);
  const archivedDir = path.join(root, 'harness', 'archive', changeId);
  assert.equal(fs.existsSync(archivedDir), true);
  const finalState = JSON.parse(fs.readFileSync(path.join(archivedDir, 'state.json'), 'utf-8'));
  assert.equal(finalState.stage, 'archive');
  assert.equal(finalState.lifecycle, 'archived');
  assert.equal(fs.existsSync(path.join(archivedDir, 'evidence', 'completion', 'archive.json')), true);

  console.log(`PASS lifecycle-archive-transition ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
