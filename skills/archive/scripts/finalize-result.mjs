import process from 'node:process';
import { createArchiveManifest } from '../../../runtime/api/archive.mjs';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertSafeId, assertSafeRunId } from '../../../runtime/api/task.mjs';

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
  if (input.behavior !== 'archive') throw new Error('EH-ARCHIVE-FINALIZE-001: handoff must use archive behavior');
  const manifest = createArchiveManifest(root, {
    changeId,
    archiveRunId: runId,
    inputDigests: input.inputDigests,
  });
  const validationPath = `harness/changes/${changeId}/validation.md`;
  const proofPath = `harness/changes/${changeId}/evidence/completion/verify.json`;
  const testCasesPath = `harness/changes/${changeId}/test-cases.md`;
  const designProofPath = `harness/changes/${changeId}/evidence/completion/design.json`;
  const manifestPath = manifest.path;
  const assertions = [
    { id: 'canonical-verify-completion-proof', verdict: 'pass', evidence: [proofPath, validationPath] },
    { id: 'canonical-design-and-test-cases', verdict: 'pass', evidence: [testCasesPath, designProofPath, manifestPath] },
    { id: 'immutable-archive-manifest', verdict: 'pass', evidence: [manifestPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'archive',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [validationPath, proofPath, testCasesPath, designProofPath, manifestPath]
      .map((artifactPath) => ({ path: artifactPath, digest: sha256Artifact(root, artifactPath) })),
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
