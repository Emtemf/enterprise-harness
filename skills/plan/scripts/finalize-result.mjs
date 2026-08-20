import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertExecutionContract } from '../assert/execution-contract.mjs';
import { assertTaskShape } from '../assert/task-shape.mjs';

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'plan'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'plan') {
    throw new Error('EH-PLAN-FINALIZE-001: handoff must be a plan artifact-worker execute run');
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-PLAN-FINALIZE-001: handoff input digest is stale: ${ref}`);
    }
  }
  const artifactPath = `harness/changes/${changeId}/tasks.md`;
  const absolutePath = path.join(root, artifactPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-PLAN-FINALIZE-002: missing ${artifactPath}`);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const checks = [
    assertTaskShape(content, artifactPath),
    assertExecutionContract(content, artifactPath),
  ];
  const findings = checks.flatMap((check) => check.findings);
  if (findings.length > 0) {
    throw new Error(`EH-PLAN-FINALIZE-003: ${findings.join('; ')}`);
  }
  const assertions = checks.map(({ id, verdict, evidence }) => ({ id, verdict, evidence }));
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'plan',
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
  if (validationProblems.length > 0) throw new Error(`EH-PLAN-FINALIZE-004: ${validationProblems.join('; ')}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
