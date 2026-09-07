import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { archiveManifestInputRefs, createArchiveManifest } from '../../../runtime/api/archive.mjs';
import { loadHandoffV2, persistHandoffV2Result } from '../../../runtime/api/handoff.mjs';
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
  if (input.behavior !== 'archive') throw new Error('EH-ARCHIVE-FINALIZE-001: handoff must use archive behavior');
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const statePath = path.join(changeDir, 'state.json');
  assertNoSymlinkComponents(changeDir, statePath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'archive'
      || state.validation?.status !== 'fresh') {
    throw new Error('EH-ARCHIVE-FINALIZE-002: v6 change must remain active at archive with fresh validation');
  }
  for (const ref of Object.values(archiveManifestInputRefs(changeId))) {
    if (!input.inputRefs.includes(ref)) throw new Error(`EH-ARCHIVE-FINALIZE-002: ${ref} must be digest-bound`);
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-ARCHIVE-FINALIZE-003: handoff input digest is stale: ${ref}`);
    }
  }
  const manifest = createArchiveManifest(root, {
    changeId,
    archiveRunId: runId,
    inputDigests: input.inputDigests,
  });
  const refs = archiveManifestInputRefs(changeId);
  const validationPath = refs.validation;
  const proofPath = refs.verifyCompletionProof;
  const testCasesPath = refs.testCases;
  const designProofPath = refs.designProof;
  const manifestPath = manifest.path;
  const attestationPath = manifest.attestation.path;
  const assertions = [
    { id: 'canonical-verify-completion-proof', verdict: 'pass', evidence: [proofPath, validationPath] },
    { id: 'canonical-lifecycle-lineage', verdict: 'pass', evidence: manifest.manifest.lineage.map(({ path: artifactPath }) => artifactPath) },
    { id: 'immutable-archive-manifest', verdict: 'pass', evidence: [manifestPath, attestationPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'archive',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [...manifest.manifest.lineage.map(({ path: artifactPath }) => artifactPath), manifestPath, attestationPath]
      .filter((artifactPath, index, all) => all.indexOf(artifactPath) === index)
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
  persistHandoffV2Result(root, changeId, runId, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
