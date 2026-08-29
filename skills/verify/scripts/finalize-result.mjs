import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateCanonicalDesignProof, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';
import { parseValidationTestCaseCoverage, persistVerificationReceipts } from '../../../runtime/api/verification-receipt.mjs';
import { assertValidationShape } from '../assert/validation-shape.mjs';

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId, 'runId');
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'verify'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'verify') {
    throw new Error('EH-VERIFY-FINALIZE-001: handoff must be a verify artifact-worker execute run');
  }
  if (input.behavior !== 'verify.collect') throw new Error('EH-VERIFY-FINALIZE-001: handoff must use verify.collect behavior');
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-VERIFY-FINALIZE-005: handoff input digest is stale: ${ref}`);
    }
  }
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
  if (!input.inputRefs.includes(testCasesRef)) throw new Error('EH-VERIFY-FINALIZE-006: test-cases input must be digest-bound');
  const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
  if (!input.inputRefs.includes(designProofRef)) throw new Error('EH-VERIFY-FINALIZE-006: compound DesignProof input must be digest-bound');
  const testCasesPath = path.join(root, testCasesRef);
  assertNoSymlinkComponents(changeDir, testCasesPath, 'test-cases.md');
  if (!fs.existsSync(testCasesPath)) throw new Error('EH-VERIFY-FINALIZE-006: missing test-cases.md');
  const canonicalDesignProblems = validateCanonicalDesignProof(root, changeId);
  if (canonicalDesignProblems.length > 0) {
    throw new Error(`EH-VERIFY-FINALIZE-006: canonical compound DesignProof is invalid: ${canonicalDesignProblems.join('; ')}`);
  }
  const artifactPath = `harness/changes/${changeId}/validation.md`;
  const absolutePath = path.join(root, artifactPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-VERIFY-FINALIZE-002: missing ${artifactPath}`);
  assertNoSymlinkComponents(changeDir, absolutePath, 'validation.md');
  const assertResult = assertValidationShape(fs.readFileSync(absolutePath, 'utf-8'));
  if (assertResult.verdict === 'block') {
    throw new Error(`EH-VERIFY-FINALIZE-003: ${assertResult.findings.join('; ')}`);
  }
  const coverage = parseValidationTestCaseCoverage(fs.readFileSync(absolutePath, 'utf-8'));
  if (coverage.problems.length > 0) throw new Error(`EH-VERIFY-FINALIZE-007: ${coverage.problems.join('; ')}`);
  const persisted = persistVerificationReceipts(root, {
    changeId,
    verifyRunId: runId,
    coverage: coverage.coverage,
    inputDigests: input.inputDigests,
    validationRef: artifactPath,
  });
  const assertions = [
    { id: assertResult.id, verdict: assertResult.verdict, evidence: assertResult.evidence },
    { id: 'test-case-consumption', verdict: 'pass', evidence: [testCasesRef, artifactPath, ...persisted.receipts.map((receipt) => receipt.path)] },
    { id: 'freshness-and-exceptions-recorded', verdict: 'pass', evidence: [artifactPath, ...persisted.receipts.map((receipt) => receipt.path)] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'verify',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: artifactPath, digest: sha256Artifact(root, artifactPath) }, ...persisted.receipts],
    assertions,
    selfCheck: { verdict: 'pass', findings: [], evidence: assertions.flatMap((assertion) => assertion.evidence) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const validationProblems = validateStageResult(root, result);
  if (validationProblems.length > 0) throw new Error(`EH-VERIFY-FINALIZE-004: ${validationProblems.join('; ')}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
