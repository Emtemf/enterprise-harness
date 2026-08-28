import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCompletionProof } from '../core/completion-proof.mjs';
import { buildCompoundDesignProof, buildDesignArchitectureProof } from '../core/design-proof.mjs';
import { sha256Artifact, validateCompletionProof } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-completion-proof-'));
const artifact = 'harness/changes/demo/tasks.md';
const artifactPath = path.join(root, artifact);
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, '# Tasks\n');
const digest = sha256Artifact(root, artifact);
const stageResult = {
  resultVersion: 1,
  type: 'stage-result',
  changeId: 'demo',
  stage: 'plan',
  runId: 'run_00000000-0000-4000-8000-000000000001',
  producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'plan' },
  inputDigests: {},
  artifacts: [{ path: artifact, digest }],
  assertions: [{ id: 'shape', verdict: 'pass', evidence: [artifact] }],
  selfCheck: { verdict: 'pass', findings: [], evidence: [artifact] },
  tecpc: { target: 'plan', evidence: [artifact], context: [artifact], path: artifact, correction: null },
  status: 'pass',
  needsDecision: null,
  completedAt: '2026-08-14T00:00:00.000Z',
};
const reviewResult = {
  resultVersion: 1,
  type: 'review-result',
  changeId: 'demo',
  stage: 'plan',
  runId: 'run_00000000-0000-4000-8000-000000000002',
  parentRunId: stageResult.runId,
  reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
  reviewedRunId: stageResult.runId,
  reviewedArtifacts: [{ path: artifact, digest }],
  rubricIds: ['plan'],
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
  assert.equal(proof.stage, 'plan');
  assert.deepEqual(proof.artifacts, stageResult.artifacts);
  assert.deepEqual(validateCompletionProof(root, proof), []);
  assert.match(
    validateCompletionProof(root, { ...proof, extra: true }).join('; '),
    /unknown property extra/u,
  );

  const blocked = { ...reviewResult, verdict: 'block', correction: 'Fix design.' };
  assert.throws(() => buildCompletionProof(root, { stageResult, reviewResult: blocked }), /EH-COMPLETION-PROOF-001/u);

  const designArtifact = 'harness/changes/demo/design.md';
  const testCasesArtifact = 'harness/changes/demo/test-cases.md';
  fs.writeFileSync(path.join(root, designArtifact), '# Design\n');
  fs.writeFileSync(path.join(root, testCasesArtifact), '# Test Cases\n');
  const architectureResult = {
    ...stageResult,
    stage: 'design',
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    artifacts: [{ path: designArtifact, digest: sha256Artifact(root, designArtifact) }],
    assertions: [{ id: 'architecture-shape', verdict: 'pass', evidence: [designArtifact] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designArtifact] },
    tecpc: {
      target: 'architecture', evidence: [designArtifact], context: [artifact],
      path: `${artifact} -> ${designArtifact}`, correction: null,
    },
  };
  const architectureReview = {
    ...reviewResult,
    stage: 'design',
    reviewedArtifacts: architectureResult.artifacts,
    rubricIds: ['design'],
    tecpc: { ...architectureResult.tecpc },
  };
  const architectureProof = buildDesignArchitectureProof(root, architectureResult, architectureReview);
  const architectureProofRef = 'harness/changes/demo/evidence/completion/design-architecture.json';
  fs.mkdirSync(path.dirname(path.join(root, architectureProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, architectureProofRef), `${JSON.stringify(architectureProof, null, 2)}\n`);
  const testDesignResult = {
    ...architectureResult,
    runId: 'run_00000000-0000-4000-8000-000000000003',
    producer: { agentType: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputDigests: {
      [designArtifact]: sha256Artifact(root, designArtifact),
      [architectureProofRef]: sha256Artifact(root, architectureProofRef),
    },
    artifacts: [{ path: testCasesArtifact, digest: sha256Artifact(root, testCasesArtifact) }],
    assertions: [{ id: 'test-design-shape', verdict: 'pass', evidence: [testCasesArtifact] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [testCasesArtifact] },
    tecpc: {
      target: 'test design', evidence: [testCasesArtifact], context: [designArtifact, architectureProofRef],
      path: `${architectureProofRef} -> ${testCasesArtifact}`, correction: null,
    },
  };
  const testDesignReview = {
    ...architectureReview,
    runId: 'run_00000000-0000-4000-8000-000000000004',
    parentRunId: testDesignResult.runId,
    reviewedRunId: testDesignResult.runId,
    reviewedArtifacts: testDesignResult.artifacts,
    tecpc: { ...testDesignResult.tecpc },
  };
  const designProof = buildCompoundDesignProof(root, architectureProof, testDesignResult, testDesignReview);
  assert.equal(Object.hasOwn(designProof, 'executionRunId'), false);
  assert.equal(Object.hasOwn(designProof, 'reviewRunId'), false);
  assert.deepEqual(designProof.stageProofs.map(({ kind }) => kind), ['architecture', 'test-design']);
  assert.deepEqual(designProof.artifacts, [architectureResult.artifacts[0], testDesignResult.artifacts[0]]);
  assert.deepEqual(validateCompletionProof(root, designProof), []);
  const bindingProjection = ({ target, evidence, context, path: proofPath }) => ({
    target, evidence, context, path: proofPath,
  });
  const changedArchitectureProof = buildCompoundDesignProof(
    root,
    {
      ...architectureProof,
      tecpc: { ...architectureProof.tecpc, target: 'changed architecture target' },
    },
    testDesignResult,
    testDesignReview,
  );
  const changedTestDesignResult = {
    ...testDesignResult,
    tecpc: { ...testDesignResult.tecpc, target: 'changed test-design target' },
  };
  const changedTestDesignProof = buildCompoundDesignProof(
    root,
    architectureProof,
    changedTestDesignResult,
    { ...testDesignReview, tecpc: { ...changedTestDesignResult.tecpc } },
  );
  assert.deepEqual(
    [changedArchitectureProof, changedTestDesignProof]
      .map((candidate) => JSON.stringify(bindingProjection(candidate)) !== JSON.stringify(bindingProjection(designProof))),
    [true, true],
    'compound proof binding must change with either canonical Design chain TECPC',
  );
  assert.match(
    validateCompletionProof(root, { ...designProof, executionRunId: architectureResult.runId }).join('; '),
    /executionRunId/u,
  );
  assert.match(
    validateCompletionProof(root, { ...designProof, stageProofs: [designProof.stageProofs[0]] }).join('; '),
    /test-design|exactly/iu,
  );
  const reusedRunProof = structuredClone(designProof);
  reusedRunProof.stageProofs[1].reviewRunId = reusedRunProof.stageProofs[1].executionRunId;
  assert.match(validateCompletionProof(root, reusedRunProof).join('; '), /independent/u);
  const duplicateKindProof = structuredClone(designProof);
  duplicateKindProof.stageProofs[1].kind = 'architecture';
  assert.match(validateCompletionProof(root, duplicateKindProof).join('; '), /test-design|duplicate|exactly/iu);

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
