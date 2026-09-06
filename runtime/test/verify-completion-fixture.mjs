// Real Verify execute/check/proof chain for Archive fixtures.  It consumes the
// public receipt contract rather than hand-writing a passing validation proof.
import fs from 'node:fs';
import path from 'node:path';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { resolveStageCompletionCandidate } from '../lib/stage-results.mjs';
import { persistVerificationReceipts } from '../api/verification-receipt.mjs';
import { verifyCommandEvidenceRef, verifyCommandOutputRef } from '../api/verify-command.mjs';
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
  const planProofRef = `${base}/evidence/completion/plan.json`;
  const implementProofRef = `${base}/evidence/completion/implement.json`;
  const tasksRef = `${base}/tasks.md`;
  const taskCommandsRef = `${base}/task-commands.json`;
  const verifyProofRef = `${base}/evidence/completion/verify.json`;
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks', '', '## Task 1: task-verify-fixture', '',
    '- Test cases: TC1', '- Strategy: `direct`', '- Minimal RED case: none', '',
  ].join('\n'));
  writeJson(path.join(root, taskCommandsRef), {
    schemaVersion: 4,
    tasks: {
      'task-verify-fixture': {
        executionStrategy: 'direct',
        strategyRationale: 'fixture validation',
        testCases: ['TC1'],
        minimalRedCase: null,
        writeScope: { allowed: ['fixture.txt'], forbidden: [] },
        commands: [{ phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'] }],
      },
    },
  });
  writeJson(path.join(root, planProofRef), { type: 'completion-proof', stage: 'plan', fixture: true });
  writeJson(path.join(root, implementProofRef), { type: 'completion-proof', stage: 'implement', fixture: true });
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
    inputRefs: [testCasesRef, designProofRef, tasksRef, taskCommandsRef, planProofRef, implementProofRef],
    tecpc,
  });
  const evidenceRef = verifyCommandEvidenceRef(changeId, execute.runId, 'TC1');
  const stdoutRef = verifyCommandOutputRef(changeId, execute.runId, 'TC1', 1, 'stdout');
  const stderrRef = verifyCommandOutputRef(changeId, execute.runId, 'TC1', 1, 'stderr');
  fs.mkdirSync(path.dirname(path.join(root, evidenceRef)), { recursive: true });
  fs.writeFileSync(path.join(root, stdoutRef), 'verify fixture evidence\n');
  fs.writeFileSync(path.join(root, stderrRef), '');
  writeJson(path.join(root, evidenceRef), {
    evidenceVersion: 1,
    type: 'verification-command-evidence',
    changeId,
    verifyRunId: execute.runId,
    tcId: 'TC1',
    agent: { id: 'fixture-verify-executor', type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputDigests: { ...execute.input.inputDigests },
    executions: [{
      taskId: 'task-verify-fixture', phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'],
      outcome: 'exit', exitCode: 0, signal: null, spawnError: null,
      startedAt: '2026-08-29T00:00:02.000Z', finishedAt: '2026-08-29T00:00:03.000Z',
      stdoutDigest: sha256Artifact(root, stdoutRef), stderrDigest: sha256Artifact(root, stderrRef),
      stdoutRef, stderrRef,
    }],
    status: 'pass',
    completedAt: '2026-08-29T00:00:03.000Z',
  });
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
