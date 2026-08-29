// Real Verify execute/check/proof chain for Archive fixtures.  It consumes the
// public receipt contract rather than hand-writing a passing validation proof.
import fs from 'node:fs';
import path from 'node:path';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { resolveStageCompletionCandidate } from '../lib/stage-results.mjs';
import { persistVerificationReceipts, verificationEvidenceDirectoryRef } from '../api/verification-receipt.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeCanonicalVerifyCompletionFixture(root, changeId) {
  const base = `harness/changes/${changeId}`;
  const validationRef = `${base}/validation.md`;
  const testCasesRef = `${base}/test-cases.md`;
  const designProofRef = `${base}/evidence/completion/design.json`;
  const verifyProofRef = `${base}/evidence/completion/verify.json`;
  const tecpc = {
    target: 'collect fresh verification evidence',
    evidence: [validationRef],
    context: [testCasesRef, designProofRef],
    path: `${testCasesRef} -> ${validationRef}`,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'verify',
    behavior: 'verify.collect',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputRefs: [testCasesRef, designProofRef],
    tecpc,
  });
  const evidenceRef = `${verificationEvidenceDirectoryRef(changeId, execute.runId)}/TC1.log`;
  fs.mkdirSync(path.dirname(path.join(root, evidenceRef)), { recursive: true });
  fs.writeFileSync(path.join(root, evidenceRef), 'verify fixture evidence\n');
  fs.writeFileSync(path.join(root, validationRef), [
    '# Validation', '', '## Commands', '- node --test', '', '## Results', '- pass', '',
    '## Freshness', '- fresh', '', '## Coverage and exceptions', `- TC1 | executed | ${evidenceRef}`,
  ].join('\n'));
  const receiptResult = persistVerificationReceipts(root, {
    changeId,
    verifyRunId: execute.runId,
    coverage: [{ tcId: 'TC1', status: 'executed', evidenceRef, reason: null }],
    inputDigests: execute.input.inputDigests,
    validationRef,
  });
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'verify',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts: [{ path: validationRef, digest: sha256Artifact(root, validationRef) }, ...receiptResult.receipts],
    assertions: [
      { id: 'validation-shape', verdict: 'pass', evidence: [validationRef] },
      { id: 'test-case-consumption', verdict: 'pass', evidence: [testCasesRef, validationRef, ...receiptResult.receipts.map((receipt) => receipt.path)] },
    ],
    selfCheck: { verdict: 'pass', findings: [], evidence: [validationRef, ...receiptResult.receipts.map((receipt) => receipt.path)] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-29T00:00:04.000Z',
  };
  persistHandoffV2Result(root, changeId, execute.runId, result);
  appendCompletedHandoffBinding(root, changeId, execute.input, { agentId: 'fixture-verify-executor' });
  const check = createHandoffV2(root, {
    changeId,
    stage: 'verify',
    behavior: 'review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [validationRef, ...receiptResult.receipts.map((receipt) => receipt.path)],
    tecpc,
  });
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'verify',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: result.artifacts.map((entry) => ({ ...entry })),
    rubricIds: [...check.input.rubricIds],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-29T00:00:05.000Z',
  };
  persistHandoffV2Result(root, changeId, check.runId, review);
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: 'fixture-verify-reviewer' });
  const candidate = resolveStageCompletionCandidate(root, changeId, 'verify', { requiredArtifactPath: validationRef });
  if (!candidate.proof) throw new Error(`verify fixture cannot build canonical proof: ${candidate.problems.join('; ')}`);
  writeJson(path.join(root, verifyProofRef), candidate.proof);
  return { validationRef, testCasesRef, designProofRef, verifyProofRef, execute, check, result, review };
}
