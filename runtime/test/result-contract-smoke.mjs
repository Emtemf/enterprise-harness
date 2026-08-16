import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  sha256Artifact,
  validateHandoffV2Contract,
  validateResearchPacket,
  validateReviewResult,
  validateStageResult,
} from '../lib/result-contract.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-result-contract-'));
const artifact = 'harness/changes/demo/design.md';
const artifactPath = path.join(root, artifact);
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, '# Design\n', 'utf-8');
const requirements = 'harness/changes/demo/requirements.md';
fs.writeFileSync(path.join(root, requirements), '# Requirements\n', 'utf-8');

const tecpc = {
  target: 'design artifact',
  evidence: [artifact],
  context: ['requirements.md'],
  path: artifact,
  correction: null,
};

const executorRunId = 'run_00000000-0000-4000-8000-000000000001';
const reviewerRunId = 'run_00000000-0000-4000-8000-000000000002';

const stageResult = {
  resultVersion: 1,
  type: 'stage-result',
  changeId: 'demo',
  stage: 'design',
  runId: executorRunId,
  producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
  inputDigests: { 'harness/changes/demo/requirements.md': 'a'.repeat(64) },
  artifacts: [{ path: artifact, digest: sha256Artifact(root, artifact) }],
  assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [artifact] }],
  selfCheck: { verdict: 'pass', findings: [], evidence: [artifact] },
  tecpc,
  status: 'pass',
  needsDecision: null,
  completedAt: '2026-08-14T00:00:00.000Z',
};

const reviewResult = {
  resultVersion: 1,
  type: 'review-result',
  changeId: 'demo',
  stage: 'design',
  runId: reviewerRunId,
  parentRunId: executorRunId,
  reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
  reviewedRunId: executorRunId,
  reviewedArtifacts: [{ path: artifact, digest: sha256Artifact(root, artifact) }],
  rubricIds: ['design', 'security'],
  tecpc,
  verdict: 'pass',
  correction: null,
  reviewedAt: '2026-08-14T00:00:01.000Z',
};

const researchPacket = {
  packetVersion: 1,
  type: 'research-packet',
  changeId: 'demo',
  source: 'code-explore',
  question: 'Where is the design module?',
  scope: ['harness/changes/demo'],
  facts: [{ claim: 'Design module exists', sources: [artifact] }],
  uncertainties: [],
  authority: 'codegraph-first',
  fallback: null,
  degraded: false,
  recommendedDecision: null,
  inputRefs: [requirements],
  inputDigests: { [requirements]: sha256Artifact(root, requirements) },
  collectedAt: '2026-08-14T00:00:00.000Z',
};

const handoff = {
  handoffVersion: 2,
  runId: executorRunId,
  changeId: 'demo',
  stage: 'design',
  behavior: 'design',
  role: 'execute',
  parentRunId: null,
  agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
  tecpc,
  inputRefs: ['harness/changes/demo/requirements.md'],
  inputDigests: { 'harness/changes/demo/requirements.md': 'a'.repeat(64) },
  rubricIds: [],
  createdAt: '2026-08-14T00:00:00.000Z',
};

try {
  assert.deepEqual(validateStageResult(root, stageResult), []);
  assert.deepEqual(validateReviewResult(root, reviewResult, { stageResult }), []);
  assert.deepEqual(validateResearchPacket(root, researchPacket), []);
  assert.deepEqual(validateHandoffV2Contract(handoff), []);

  const missingResearchContext = structuredClone(researchPacket);
  delete missingResearchContext.question;
  assert.match(validateResearchPacket(root, missingResearchContext).join('\n'), /question is required/);

  const staleStage = structuredClone(stageResult);
  staleStage.artifacts[0].digest = 'b'.repeat(64);
  assert.match(validateStageResult(root, staleStage).join('\n'), /artifact digest is stale/);

  const missingSelfCheck = structuredClone(stageResult);
  delete missingSelfCheck.selfCheck;
  assert.match(validateStageResult(root, missingSelfCheck).join('\n'), /selfCheck is required/);

  const selfReview = structuredClone(reviewResult);
  selfReview.runId = stageResult.runId;
  assert.match(validateReviewResult(root, selfReview, { stageResult }).join('\n'), /independent run/);

  const badPass = structuredClone(reviewResult);
  badPass.correction = 'unresolved issue';
  assert.match(validateReviewResult(root, badPass, { stageResult }).join('\n'), /pass requires correction=null/);

  const legacyAgent = structuredClone(handoff);
  legacyAgent.agent = { type: 'enterprise-harness:design-executor', skill: 'harness' };
  assert.match(
    validateHandoffV2Contract(legacyAgent).join('\n'),
    /agent must be enterprise-harness:artifact-worker with skill design/u,
  );

  const v1 = structuredClone(handoff);
  v1.handoffVersion = 1;
  assert.match(validateHandoffV2Contract(v1).join('\n'), /handoffVersion must be 2/);

  const extraField = structuredClone(stageResult);
  extraField.untrusted = true;
  assert.match(validateStageResult(root, extraField).join('\n'), /unknown property untrusted/);

  if (mode === 'red') {
    console.error('Expected result contract test to fail before implementation.');
    process.exitCode = 1;
  } else {
    console.log(`PASS result-contract ${mode}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
