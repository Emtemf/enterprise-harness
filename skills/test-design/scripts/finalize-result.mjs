import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  loadHandoffV2,
  persistHandoffV2Result,
  readClassificationArtifact,
  v2ResultPath,
} from '../../../runtime/api/handoff.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  assertSafeRunId,
  resolveChild,
} from '../../../runtime/api/task.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import {
  designArchitectureProofRef,
  readDesignArchitectureProof,
  validateCanonicalDesignArchitectureBinding,
} from '../../../runtime/api/design.mjs';
import { assertArtifactShape } from '../assert/artifact-shape.mjs';
import { assertCoverage } from '../assert/coverage.mjs';
import { assertTraceability } from '../assert/traceability.mjs';

const [changeId, runId] = process.argv.slice(2);

function sameDigestMap(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function requiredFile(changeDir, name) {
  const target = path.join(changeDir, name);
  assertNoSymlinkComponents(changeDir, target, name);
  if (!fs.existsSync(target)) throw new Error(`EH-TEST-DESIGN-FINALIZE-001: missing ${name}`);
  return target;
}

function assertDispatch(input) {
  if (input.stage !== 'design'
      || input.role !== 'execute'
      || input.behavior !== 'design.test-cases'
      || input.agent?.type !== 'enterprise-harness:test-design-worker'
      || input.agent?.skill !== 'test-design') {
    throw new Error('EH-TEST-DESIGN-FINALIZE-002: handoff must be a design.test-cases test-design-worker execute run');
  }
}

function assertBound(input, ref, message) {
  if (!ref || !input.inputRefs.includes(ref)) throw new Error(message);
}

if (!changeId || !runId) {
  console.error('Usage: node skills/test-design/scripts/finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId, 'runId');
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  assertDispatch(input);
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-TEST-DESIGN-FINALIZE-003: handoff input digest is stale: ${ref}`);
    }
  }

  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const state = JSON.parse(fs.readFileSync(requiredFile(changeDir, 'state.json'), 'utf-8'));
  if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'design') {
    throw new Error('EH-TEST-DESIGN-FINALIZE-004: v6 active change must still be at design stage');
  }
  const requirementsPath = requiredFile(changeDir, 'requirements.md');
  const designPath = requiredFile(changeDir, 'design.md');
  const testCasesPath = requiredFile(changeDir, 'test-cases.md');
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const designRef = `harness/changes/${changeId}/design.md`;
  const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
  const classificationRef = state.artifacts?.classification?.path;
  const architectureRef = designArchitectureProofRef(changeId);
  assertBound(input, requirementsRef, 'EH-TEST-DESIGN-FINALIZE-005: requirements input must be digest-bound');
  assertBound(input, classificationRef, 'EH-TEST-DESIGN-FINALIZE-006: classification input must be digest-bound');
  assertBound(input, designRef, 'EH-TEST-DESIGN-FINALIZE-007: design input must be digest-bound');
  assertBound(input, architectureRef, 'EH-TEST-DESIGN-FINALIZE-008: architecture proof must be digest-bound');

  const architectureProof = readDesignArchitectureProof(root, changeId);
  const bindingProblems = validateCanonicalDesignArchitectureBinding(root, changeId, architectureProof);
  if (bindingProblems.length > 0) {
    throw new Error(`EH-TEST-DESIGN-FINALIZE-013: canonical architecture binding is invalid: ${bindingProblems.join('; ')}`);
  }
  const architectureResultPath = v2ResultPath(root, changeId, architectureProof.executionRunId);
  const architectureResultRef = path.relative(root, architectureResultPath).split(path.sep).join('/');
  assertBound(input, architectureResultRef, 'EH-TEST-DESIGN-FINALIZE-009: architecture StageResult must be digest-bound');
  const architectureResult = JSON.parse(fs.readFileSync(architectureResultPath, 'utf-8'));
  const architectureProblems = validateStageResult(root, architectureResult);
  if (architectureProblems.length > 0
      || architectureResult.changeId !== changeId
      || architectureResult.stage !== 'design'
      || architectureResult.runId !== architectureProof.executionRunId
      || architectureResult.status !== 'pass'
      || architectureResult.artifacts?.length !== 1
      || architectureResult.artifacts[0]?.path !== designRef
      || architectureResult.artifacts[0]?.digest !== architectureProof.artifacts[0]?.digest
      || !sameDigestMap(architectureResult.inputDigests, architectureProof.inputDigests)) {
    throw new Error(`EH-TEST-DESIGN-FINALIZE-010: architecture StageResult does not match ArchitectureProof${architectureProblems.length ? `: ${architectureProblems.join('; ')}` : ''}`);
  }

  const classification = readClassificationArtifact(root, changeId, state.artifacts.classification);
  const requirements = fs.readFileSync(requirementsPath, 'utf-8');
  const design = fs.readFileSync(designPath, 'utf-8');
  const testCases = fs.readFileSync(testCasesPath, 'utf-8');
  const paths = { requirements: requirementsRef, design: designRef, testCases: testCasesRef };
  const checks = [
    assertArtifactShape(testCases, classification.impact, testCasesRef),
    assertCoverage(requirements, design, testCases, paths),
    assertTraceability(requirements, design, testCases, paths),
  ];
  const failures = checks.flatMap((check) => check.problems || []);
  if (failures.length > 0) throw new Error(`EH-TEST-DESIGN-FINALIZE-011: ${failures.join('; ')}`);

  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: testCasesRef, digest: sha256Artifact(root, testCasesRef) }],
    assertions: checks.map(({ id, verdict, evidence }) => ({ id, verdict, evidence })),
    selfCheck: {
      verdict: 'pass',
      findings: [],
      evidence: [...new Set(checks.flatMap(({ evidence }) => evidence))],
    },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const problems = validateStageResult(root, result);
  if (problems.length > 0) throw new Error(`EH-TEST-DESIGN-FINALIZE-012: ${problems.join('; ')}`);
  persistHandoffV2Result(root, changeId, runId, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
