import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  assertSafeRunId,
  gitCommonDir,
  resolveWorktreeContext,
  taskExecutionReceiptPath,
  taskExecutionReceiptSpoolPath,
  validateTaskExecutionReceipt,
} from '../../../runtime/api/task.mjs';

const args = process.argv.slice(2);
const [changeId, taskId, runId] = args;
if (args.length !== 3 || !changeId || !taskId || !runId) {
  console.error('Usage: node finalize-result.mjs <change-id> <task-id> <run-id>');
  process.exit(2);
}

try {
  assertSafeId(changeId, 'changeId');
  assertSafeId(taskId, 'taskId');
  assertSafeRunId(runId, 'runId');
  const executionRoot = process.cwd();
  const context = resolveWorktreeContext(executionRoot, { requireIsolatedWhenBound: true });
  const root = context.subjectRoot;
  const input = loadHandoffV2(executionRoot, changeId, runId);
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-IMPLEMENT-FINALIZE-001: handoff input digest is stale: ${ref}`);
    }
  }
  if (input.role !== 'execute' || input.stage !== 'implement'
    || input.agent?.type !== 'enterprise-harness:implementer' || input.agent?.skill !== 'implement') {
    throw new Error('EH-IMPLEMENT-FINALIZE-001: handoff must be an implementer execute run');
  }
  const absoluteReceipt = taskExecutionReceiptPath(root, changeId, taskId);
  assertNoSymlinkComponents(root, absoluteReceipt, 'canonical task receipt path');
  if (!fs.existsSync(absoluteReceipt)) {
    throw new Error(`EH-IMPLEMENT-FINALIZE-002: missing canonical receipt for ${taskId}`);
  }
  const receiptPath = path.relative(root, absoluteReceipt).split(path.sep).join('/');
  const receipt = JSON.parse(fs.readFileSync(absoluteReceipt, 'utf-8'));
  const spoolPath = taskExecutionReceiptSpoolPath(executionRoot, changeId, taskId, runId);
  assertNoSymlinkComponents(gitCommonDir(executionRoot), spoolPath, 'task receipt spool path');
  if (!fs.existsSync(spoolPath)) {
    throw new Error(`EH-IMPLEMENT-FINALIZE-002: missing receipt spool for run ${runId}`);
  }
  const spool = JSON.parse(fs.readFileSync(spoolPath, 'utf-8'));
  if (spool.spoolVersion !== 1 || spool.runId !== runId
    || JSON.stringify(spool.receipt) !== JSON.stringify(receipt)) {
    throw new Error('EH-IMPLEMENT-FINALIZE-003: canonical receipt is not bound to this execute run');
  }
  const receiptProblems = validateTaskExecutionReceipt(receipt, {
    root,
    expectedChangeId: changeId,
    expectedTaskId: taskId,
    expectedInputDigests: input.inputDigests,
    requireTrusted: true,
  });
  if (receiptProblems.length > 0) {
    throw new Error(`EH-IMPLEMENT-FINALIZE-003: ${receiptProblems.join('; ')}`);
  }
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    if (state.schemaVersion === 6 && state.currentTask && state.currentTask !== taskId) {
      throw new Error(`EH-IMPLEMENT-FINALIZE-001: task ${taskId} is not the current task ${state.currentTask}`);
    }
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
