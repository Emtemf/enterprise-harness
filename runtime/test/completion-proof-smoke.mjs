import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import { sha256Artifact, validateCompletionProof } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

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

  const clarifyId = 'clarify-proof';
  const clarifyRequirements = `harness/changes/${clarifyId}/requirements.md`;
  fs.mkdirSync(path.dirname(path.join(root, clarifyRequirements)), { recursive: true });
  fs.writeFileSync(path.join(root, clarifyRequirements), approvedRequirements());
  const classification = writeClassificationV2Fixture(root, clarifyId, { tier: 'L1' });
  const clarifyArtifactPaths = [
    clarifyRequirements,
    classification.path,
    `harness/changes/${clarifyId}/debt-assessment.json`,
    `harness/changes/${clarifyId}/project-contract-assessment.json`,
    `harness/changes/${clarifyId}/evidence/decisions/clarify-decision-snapshot.json`,
  ];
  const clarifyArtifacts = clarifyArtifactPaths.map((artifactPath) => ({
    path: artifactPath,
    digest: sha256Artifact(root, artifactPath),
  }));
  const assertionIds = [
    'research-complete', 'decisions-durable', 'technical-debt-disposed',
    'project-contract-disposed', 'requirements-ready', 'classification-ready', 'scope-confirmed',
  ];
  const clarifyTecpc = {
    target: 'complete Clarify', evidence: clarifyArtifactPaths, context: clarifyArtifactPaths,
    path: clarifyArtifactPaths.join(' -> '), correction: null,
  };
  const clarifyResult = {
    ...stageResult,
    changeId: clarifyId,
    stage: 'clarify',
    producer: { agentType: 'enterprise-harness:main', skill: 'harness' },
    inputDigests: Object.fromEntries(clarifyArtifacts.map(({ path: artifactPath, digest: artifactDigest }) => [artifactPath, artifactDigest])),
    artifacts: clarifyArtifacts,
    assertions: assertionIds.map((id) => ({ id, verdict: 'pass', evidence: [clarifyRequirements] })),
    selfCheck: { verdict: 'pass', findings: [], evidence: clarifyArtifactPaths },
    tecpc: clarifyTecpc,
  };
  clarifyResult.assertions[1].evidence = [clarifyArtifactPaths[4]];
  clarifyResult.assertions[6].evidence = [clarifyArtifactPaths[4]];
  const clarifyReview = {
    ...reviewResult,
    changeId: clarifyId,
    stage: 'clarify',
    reviewedArtifacts: clarifyArtifacts,
    tecpc: clarifyTecpc,
  };
  assert.throws(
    () => buildCompletionProof(root, {
      stageResult: clarifyResult,
      reviewResult: clarifyReview,
      producerAgentIds: ['agent-shared'],
      reviewerAgentIds: ['agent-shared', 'agent-distinct'],
    }),
    /reviewer agent ID.*producer binding/u,
  );
  const clarifyProof = buildCompletionProof(root, {
    stageResult: clarifyResult,
    reviewResult: clarifyReview,
    producerAgentIds: ['agent-producer'],
    reviewerAgentIds: ['agent-reviewer'],
    createdAt: '2026-08-25T00:00:02.000Z',
  });
  assert.deepEqual(clarifyProof.reviewedArtifacts, clarifyArtifacts);
  assert.deepEqual(clarifyProof.decisionSnapshotRef, clarifyArtifacts[4]);
  assert.deepEqual(clarifyProof.assertions, clarifyResult.assertions);
  assert.deepEqual(clarifyProof.tecpc, clarifyTecpc);
  assert.deepEqual(validateCompletionProof(root, clarifyProof), []);
  console.log(`PASS completion proof ${process.argv[2] || 'verify'}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
