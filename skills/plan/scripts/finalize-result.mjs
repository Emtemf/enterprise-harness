import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';
import { assertTaskShape } from '../assert/task-shape.mjs';

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
  const artifactPath = `harness/changes/${changeId}/tasks.md`;
  const absolutePath = path.join(root, artifactPath);
  assertNoSymlinkComponents(changeDir, absolutePath, 'tasks.md');
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-PLAN-FINALIZE-002: missing ${artifactPath}`);
  const assertResult = assertTaskShape(fs.readFileSync(absolutePath, 'utf-8'));
  if (assertResult.verdict === 'block') {
    throw new Error(`EH-PLAN-FINALIZE-003: ${assertResult.findings.join('; ')}`);
  }
  const assertions = [
    { id: assertResult.id, verdict: assertResult.verdict, evidence: assertResult.evidence },
  ];
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
