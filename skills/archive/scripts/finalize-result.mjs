import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';

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
  if (input.role !== 'execute' || input.stage !== 'archive'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'archive') {
    throw new Error('EH-ARCHIVE-FINALIZE-001: handoff must be an archive artifact-worker execute run');
  }
  const validationPath = `harness/changes/${changeId}/validation.md`;
  const proofPath = `harness/changes/${changeId}/evidence/completion/verify.json`;
  const testCasesPath = `harness/changes/${changeId}/test-cases.md`;
  const designProofPath = `harness/changes/${changeId}/evidence/completion/design.json`;
  const manifestPath = `harness/changes/${changeId}/evidence/archive-manifest.json`;
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  for (const artifactPath of [validationPath, proofPath, testCasesPath, designProofPath]) {
    if (!input.inputRefs.includes(artifactPath)) throw new Error(`EH-ARCHIVE-FINALIZE-005: ${artifactPath} must be digest-bound`);
    if (!fs.existsSync(path.join(root, artifactPath))) throw new Error(`EH-ARCHIVE-FINALIZE-002: missing ${artifactPath}`);
    if (sha256Artifact(root, artifactPath) !== input.inputDigests[artifactPath]) {
      throw new Error(`EH-ARCHIVE-FINALIZE-006: handoff input digest is stale: ${artifactPath}`);
    }
    assertNoSymlinkComponents(changeDir, path.join(root, artifactPath), artifactPath);
  }
  const proof = JSON.parse(fs.readFileSync(path.join(root, proofPath), 'utf-8'));
  if (proof.type !== 'completion-proof' || proof.stage !== 'verify') {
    throw new Error('EH-ARCHIVE-FINALIZE-003: verify CompletionProof is invalid');
  }
  const designProof = JSON.parse(fs.readFileSync(path.join(root, designProofPath), 'utf-8'));
  if (designProof.type !== 'completion-proof' || designProof.stage !== 'design') {
    throw new Error('EH-ARCHIVE-FINALIZE-007: compound DesignProof is invalid');
  }
  const testDesign = designProof.stageProofs?.find((item) => item?.kind === 'test-design');
  if (!testDesign?.executionRunId || !testDesign?.reviewRunId) {
    throw new Error('EH-ARCHIVE-FINALIZE-008: DesignProof must reference test-design result and review');
  }
  const manifestAbsolute = path.join(root, manifestPath);
  assertNoSymlinkComponents(changeDir, manifestAbsolute, 'archive manifest');
  if (fs.existsSync(manifestAbsolute)) throw new Error(`EH-ARCHIVE-FINALIZE-009: archive manifest already exists: ${manifestPath}`);
  fs.mkdirSync(path.dirname(manifestAbsolute), { recursive: true });
  fs.writeFileSync(manifestAbsolute, `${JSON.stringify({
    manifestVersion: 1,
    changeId,
    testCases: { path: testCasesPath, digest: sha256Artifact(root, testCasesPath) },
    designProof: { path: designProofPath, digest: sha256Artifact(root, designProofPath) },
    testDesign: { executionRunId: testDesign.executionRunId, reviewRunId: testDesign.reviewRunId },
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
  const assertions = [
    { id: 'verify-completion-proof', verdict: 'pass', evidence: [proofPath] },
    { id: 'archive-inputs-present', verdict: 'pass', evidence: [validationPath, proofPath, testCasesPath, designProofPath, manifestPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'archive',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [
      { path: validationPath, digest: sha256Artifact(root, validationPath) },
      { path: proofPath, digest: sha256Artifact(root, proofPath) },
      { path: testCasesPath, digest: sha256Artifact(root, testCasesPath) },
      { path: designProofPath, digest: sha256Artifact(root, designProofPath) },
      { path: manifestPath, digest: sha256Artifact(root, manifestPath) },
    ],
    assertions,
    selfCheck: { verdict: 'pass', findings: [], evidence: assertions.flatMap((assertion) => assertion.evidence) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const problems = validateStageResult(root, result);
  if (problems.length > 0) throw new Error(`EH-ARCHIVE-FINALIZE-004: ${problems.join('; ')}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
