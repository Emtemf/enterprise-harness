import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/core/handoff-v2.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/lib/result-contract.mjs';

function validateValidationArtifact(content) {
  const problems = [];
  if (!content.startsWith('# Validation\n')) problems.push('validation.md must start with # Validation');
  if (/<[^>]+>/u.test(content)) problems.push('validation.md contains an unresolved placeholder');
  for (const heading of ['## Commands', '## Results', '## Freshness', '## Coverage and exceptions']) {
    if (!content.includes(heading)) problems.push(`validation.md is missing ${heading}`);
  }
  return problems;
}

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'verify'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'verify') {
    throw new Error('EH-VERIFY-FINALIZE-001: handoff must be a verify artifact-worker execute run');
  }
  const artifactPath = `harness/changes/${changeId}/validation.md`;
  const absolutePath = path.join(root, artifactPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-VERIFY-FINALIZE-002: missing ${artifactPath}`);
  const artifactProblems = validateValidationArtifact(fs.readFileSync(absolutePath, 'utf-8'));
  if (artifactProblems.length > 0) throw new Error(`EH-VERIFY-FINALIZE-003: ${artifactProblems.join('; ')}`);
  const assertions = [
    { id: 'validation-shape', verdict: 'pass', evidence: [artifactPath] },
    { id: 'freshness-and-exceptions-recorded', verdict: 'pass', evidence: [artifactPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'verify',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: artifactPath, digest: sha256Artifact(root, artifactPath) }],
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
