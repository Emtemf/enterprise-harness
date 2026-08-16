import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import { sha256Artifact, validateCompletionProof } from '../lib/result-contract.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-completion-proof-'));
const artifact = 'harness/changes/demo/design.md';
const artifactPath = path.join(root, artifact);
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, '# Design\n');
const digest = sha256Artifact(root, artifact);
const stageResult = {
  resultVersion: 1,
  type: 'stage-result',
  changeId: 'demo',
  stage: 'design',
  runId: 'run_00000000-0000-4000-8000-000000000001',
  producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
  inputDigests: {},
  artifacts: [{ path: artifact, digest }],
  assertions: [{ id: 'shape', verdict: 'pass', evidence: [artifact] }],
  selfCheck: { verdict: 'pass', findings: [], evidence: [artifact] },
  tecpc: { target: 'design', evidence: [artifact], context: [artifact], path: artifact, correction: null },
  status: 'pass',
  needsDecision: null,
  completedAt: '2026-08-14T00:00:00.000Z',
};
const reviewResult = {
  resultVersion: 1,
  type: 'review-result',
  changeId: 'demo',
  stage: 'design',
  runId: 'run_00000000-0000-4000-8000-000000000002',
  parentRunId: stageResult.runId,
  reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
  reviewedRunId: stageResult.runId,
  reviewedArtifacts: [{ path: artifact, digest }],
  rubricIds: ['design'],
  tecpc: { ...stageResult.tecpc },
  verdict: 'pass',
  correction: null,
  reviewedAt: '2026-08-14T00:00:01.000Z',
};

try {
  const proof = buildCompletionProof(root, { stageResult, reviewResult, createdAt: '2026-08-14T00:00:02.000Z' });
  assert.equal(proof.type, 'completion-proof');
  assert.equal(proof.executionRunId, stageResult.runId);
  assert.equal(proof.reviewRunId, reviewResult.runId);
  assert.equal(proof.stage, 'design');
  assert.deepEqual(proof.artifacts, stageResult.artifacts);
  assert.deepEqual(validateCompletionProof(root, proof), []);
  assert.match(
    validateCompletionProof(root, { ...proof, extra: true }).join('; '),
    /unknown property extra/u,
  );

  const blocked = { ...reviewResult, verdict: 'block', correction: 'Fix design.' };
  assert.throws(() => buildCompletionProof(root, { stageResult, reviewResult: blocked }), /EH-COMPLETION-PROOF-001/u);
  console.log(`PASS completion proof ${process.argv[2] || 'verify'}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
