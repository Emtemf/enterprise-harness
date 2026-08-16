import fs from 'node:fs';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/core/handoff-v2.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/lib/result-contract.mjs';
import { resolveWithin } from '../../../runtime/lib/safe-paths.mjs';
import { validateTaskExecutionReceipt } from '../../../runtime/lib/task-execution-receipt.mjs';

const [changeId, runId, receiptPath] = process.argv.slice(2);
if (!changeId || !runId || !receiptPath) {
  console.error('Usage: node finalize-result.mjs <change-id> <run-id> <receipt-path>');
  process.exit(2);
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-IMPLEMENT-FINALIZE-001: handoff input digest is stale: ${ref}`);
    }
  }
  if (input.role !== 'execute' || input.stage !== 'implement'
    || input.agent?.type !== 'enterprise-harness:implementer' || input.agent?.skill !== 'implement') {
    throw new Error('EH-IMPLEMENT-FINALIZE-001: handoff must be an implementer execute run');
  }
  const expectedPrefix = `harness/changes/${changeId}/evidence/tasks/`;
  if (!receiptPath.startsWith(expectedPrefix) || !receiptPath.endsWith('.json')) {
    throw new Error(`EH-IMPLEMENT-FINALIZE-002: receipt must be under ${expectedPrefix}`);
  }
  const absoluteReceipt = resolveWithin(root, receiptPath, 'receiptPath');
  if (!fs.existsSync(absoluteReceipt)) throw new Error(`EH-IMPLEMENT-FINALIZE-002: missing ${receiptPath}`);
  const receipt = JSON.parse(fs.readFileSync(absoluteReceipt, 'utf-8'));
  if (JSON.stringify(Object.entries(receipt.inputDigests || {}).sort())
    !== JSON.stringify(Object.entries(input.inputDigests || {}).sort())) {
    throw new Error('EH-IMPLEMENT-FINALIZE-001: receipt input digests do not match the handoff');
  }
  const receiptProblems = validateTaskExecutionReceipt(receipt, {
    root,
    requireTrusted: true,
    expectedInputDigests: input.inputDigests,
  });
  if (receipt.changeId !== changeId) receiptProblems.push('receipt changeId does not match the handoff');
  if (receiptProblems.length > 0) {
    throw new Error(`EH-IMPLEMENT-FINALIZE-003: ${receiptProblems.join('; ')}`);
  }
  const assertions = [
    { id: 'machine-receipt', verdict: 'pass', evidence: [receiptPath] },
    { id: 'strategy-executions-pass', verdict: 'pass', evidence: [receiptPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'implement',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: receiptPath, digest: sha256Artifact(root, receiptPath) }],
    assertions,
    selfCheck: { verdict: 'pass', findings: [], evidence: assertions.flatMap((assertion) => assertion.evidence) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const problems = validateStageResult(root, result);
  if (problems.length > 0) throw new Error(`EH-IMPLEMENT-FINALIZE-004: ${problems.join('; ')}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
