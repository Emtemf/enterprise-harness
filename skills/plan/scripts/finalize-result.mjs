import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2, persistHandoffV2Result } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateCanonicalDesignProof, validatePlanTestCaseBindings, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';
import { assertTaskShape } from '../assert/task-shape.mjs';
import { assertTaskCommandShape } from '../assert/task-command-shape.mjs';

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
  if (input.role !== 'execute' || input.stage !== 'plan'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'plan') {
    throw new Error('EH-PLAN-FINALIZE-001: handoff must be a plan artifact-worker execute run');
  }
  if (input.behavior !== 'plan.produce') {
    throw new Error('EH-PLAN-FINALIZE-001: handoff must use plan.produce behavior');
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-PLAN-FINALIZE-005: handoff input digest is stale: ${ref}`);
    }
  }
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const statePath = path.join(changeDir, 'state.json');
  assertNoSymlinkComponents(changeDir, statePath, 'state.json');
  if (!fs.existsSync(statePath)) throw new Error('EH-PLAN-FINALIZE-006: missing state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'plan') {
    throw new Error('EH-PLAN-FINALIZE-007: v6 change must be active at plan stage');
  }
  const designRef = `harness/changes/${changeId}/design.md`;
  const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
  const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
  for (const ref of [designRef, testCasesRef, designProofRef]) {
    if (!input.inputRefs.includes(ref)) {
      throw new Error(`EH-PLAN-FINALIZE-008: ${ref.endsWith('test-cases.md') ? 'test-cases' : ref.endsWith('design.json') ? 'compound DesignProof' : 'design'} input must be digest-bound`);
    }
  }
  const designProofPath = path.join(root, designProofRef);
  assertNoSymlinkComponents(changeDir, designProofPath, 'compound DesignProof');
  const designProof = JSON.parse(fs.readFileSync(designProofPath, 'utf-8'));
  if (designProof.type !== 'completion-proof' || designProof.stage !== 'design') {
    throw new Error('EH-PLAN-FINALIZE-009: compound DesignProof is invalid');
  }
  const canonicalDesignProblems = validateCanonicalDesignProof(root, changeId);
  if (canonicalDesignProblems.length > 0) {
    throw new Error(`EH-PLAN-FINALIZE-009: canonical compound DesignProof is invalid: ${canonicalDesignProblems.join('; ')}`);
  }
  const artifactPath = `harness/changes/${changeId}/tasks.md`;
  const taskCommandsPath = `harness/changes/${changeId}/task-commands.json`;
  const absolutePath = path.join(root, artifactPath);
  const absoluteTaskCommandsPath = path.join(root, taskCommandsPath);
  assertNoSymlinkComponents(changeDir, absolutePath, 'tasks.md');
  assertNoSymlinkComponents(changeDir, absoluteTaskCommandsPath, 'task-commands.json');
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-PLAN-FINALIZE-002: missing ${artifactPath}`);
  if (!fs.existsSync(absoluteTaskCommandsPath)) throw new Error(`EH-PLAN-FINALIZE-002: missing ${taskCommandsPath}`);
  const tasksContent = fs.readFileSync(absolutePath, 'utf-8');
  const assertResult = assertTaskShape(tasksContent);
  if (assertResult.verdict === 'block') {
    throw new Error(`EH-PLAN-FINALIZE-003: ${assertResult.findings.join('; ')}`);
  }
  let taskCommands;
  try {
    taskCommands = JSON.parse(fs.readFileSync(absoluteTaskCommandsPath, 'utf-8'));
  } catch (error) {
    throw new Error(`EH-PLAN-FINALIZE-011: task-commands.json is invalid JSON: ${error.message}`);
  }
  const taskCommandResult = assertTaskCommandShape(taskCommands, tasksContent);
  if (taskCommandResult.verdict === 'block') {
    throw new Error(`EH-PLAN-FINALIZE-011: ${taskCommandResult.findings.join('; ')}`);
  }
  const testCaseBindings = validatePlanTestCaseBindings(
    fs.readFileSync(path.join(root, testCasesRef), 'utf-8'),
    tasksContent,
  );
  if (testCaseBindings.problems.length > 0) {
    throw new Error(`EH-PLAN-FINALIZE-010: ${testCaseBindings.problems.join('; ')}`);
  }
  const assertions = [
    { id: assertResult.id, verdict: assertResult.verdict, evidence: assertResult.evidence },
    { id: taskCommandResult.id, verdict: taskCommandResult.verdict, evidence: taskCommandResult.evidence },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'plan',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [
      { path: artifactPath, digest: sha256Artifact(root, artifactPath) },
      { path: taskCommandsPath, digest: sha256Artifact(root, taskCommandsPath) },
    ],
    assertions,
    selfCheck: { verdict: 'pass', findings: [], evidence: assertions.flatMap((assertion) => assertion.evidence) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const validationProblems = validateStageResult(root, result);
  if (validationProblems.length > 0) throw new Error(`EH-PLAN-FINALIZE-004: ${validationProblems.join('; ')}`);
  persistHandoffV2Result(root, changeId, runId, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
