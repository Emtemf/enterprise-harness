import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/core/handoff-v2.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/lib/result-contract.mjs';

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'archive'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'archive') {
    throw new Error('EH-ARCHIVE-FINALIZE-001: handoff must be an archive artifact-worker execute run');
  }
  const validationPath = `harness/changes/${changeId}/validation.md`;
  const proofPath = `harness/changes/${changeId}/evidence/completion/verify.json`;
  for (const artifactPath of [validationPath, proofPath]) {
    if (!fs.existsSync(path.join(root, artifactPath))) throw new Error(`EH-ARCHIVE-FINALIZE-002: missing ${artifactPath}`);
  }
  const proof = JSON.parse(fs.readFileSync(path.join(root, proofPath), 'utf-8'));
  if (proof.type !== 'completion-proof' || proof.stage !== 'verify') {
    throw new Error('EH-ARCHIVE-FINALIZE-003: verify CompletionProof is invalid');
  }
  const assertions = [
    { id: 'verify-completion-proof', verdict: 'pass', evidence: [proofPath] },
    { id: 'archive-inputs-present', verdict: 'pass', evidence: [validationPath, proofPath] },
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
