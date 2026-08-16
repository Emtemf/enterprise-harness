import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import {
  sha256Artifact,
  validateCompletionProof,
  validateStageResult,
} from '../lib/result-contract.mjs';
import { createWaiver, validateWaiver } from '../lib/waiver.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-waiver-result-'));
const artifactPath = 'harness/changes/demo/design.md';
fs.mkdirSync(path.dirname(path.join(root, artifactPath)), { recursive: true });
fs.writeFileSync(path.join(root, artifactPath), '# Design\n', 'utf-8');
const digest = sha256Artifact(root, artifactPath);
const executionRunId = 'run_00000000-0000-4000-8000-000000000041';
const reviewRunId = 'run_00000000-0000-4000-8000-000000000042';

const waiver = createWaiver({
  waiverId: 'waiver-design-demo',
  rule: 'CONFIGURATION_NOT_TESTABLE',
  scope: 'design configuration fixture',
  reason: 'This fixture has no executable runtime surface.',
  approvedBy: 'maintainer@example.test',
  artifact: { path: artifactPath, digest },
  createdAt: '2026-08-16T00:00:00.000Z',
});

const stageResult = {
  resultVersion: 1,
  type: 'stage-result',
  changeId: 'demo',
  stage: 'design',
  runId: executionRunId,
  producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
  inputDigests: {},
  artifacts: [{ path: artifactPath, digest }],
  waivers: [waiver],
  assertions: [{ id: 'design-shape', verdict: 'pass', evidence: [artifactPath] }],
  selfCheck: { verdict: 'pass', findings: [], evidence: [artifactPath] },
  tecpc: {
    target: 'design artifact',
    evidence: [artifactPath],
    context: [artifactPath],
    path: artifactPath,
    correction: null,
  },
  status: 'pass',
  needsDecision: null,
  completedAt: '2026-08-16T00:00:01.000Z',
};

const reviewResult = {
  resultVersion: 1,
  type: 'review-result',
  changeId: 'demo',
  stage: 'design',
  runId: reviewRunId,
  parentRunId: executionRunId,
  reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
  reviewedRunId: executionRunId,
  reviewedArtifacts: [{ path: artifactPath, digest }],
  rubricIds: ['design'],
  tecpc: {
    target: 'independent design review',
    evidence: [artifactPath],
    context: [artifactPath],
    path: artifactPath,
    correction: null,
  },
  verdict: 'pass',
  correction: null,
  reviewedAt: '2026-08-16T00:00:02.000Z',
};

try {
  const stageProblems = validateStageResult(root, stageResult);
  assert.match(
    stageProblems.join('\n'),
    /waivers are disabled until trusted authorization evidence is available/,
  );

  const proofInput = structuredClone(stageResult);
  proofInput.waivers = [];
  const proof = buildCompletionProof(root, {
    stageResult: proofInput,
    reviewResult,
    createdAt: '2026-08-16T00:00:03.000Z',
  });
  const proofWithWaiver = { ...proof, waivers: [waiver] };
  assert.match(
    validateCompletionProof(root, proofWithWaiver).join('\n'),
    /waivers are disabled until trusted authorization evidence is available/,
  );

  const missingApproval = structuredClone(waiver);
  delete missingApproval.approvedBy;
  assert.throws(() => validateWaiver(missingApproval), /approvedBy/);

  const unknownProperty = structuredClone(waiver);
  unknownProperty.advisory = true;
  assert.throws(() => validateWaiver(unknownProperty), /unknown property advisory/);

  const staleStage = structuredClone(stageResult);
  staleStage.waivers[0].artifact.digest = 'b'.repeat(64);
  assert.match(validateStageResult(root, staleStage).join('\n'), /waivers\[0\] artifact digest is stale/);

  const unrelatedArtifact = structuredClone(stageResult);
  unrelatedArtifact.waivers[0].artifact.path = 'harness/changes/demo/unrelated.md';
  assert.match(validateStageResult(root, unrelatedArtifact).join('\n'), /waivers\[0\] artifact is not a stage result artifact/);

  const hardBlock = structuredClone(stageResult);
  hardBlock.assertions[0].verdict = 'block';
  assert.match(validateStageResult(root, hardBlock).join('\n'), /pass requires every assertion to pass/);

  const staleProof = structuredClone(proofWithWaiver);
  staleProof.waivers[0].artifact.digest = 'c'.repeat(64);
  assert.match(validateCompletionProof(root, staleProof).join('\n'), /waivers\[0\] artifact digest is stale/);

  if (mode === 'red') {
    console.error('Expected waiver result integration to fail before implementation.');
    process.exitCode = 1;
  } else {
    console.log(`PASS waiver-result-contract ${mode}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
