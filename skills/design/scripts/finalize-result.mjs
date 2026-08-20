import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertArtifactShape } from '../assert/artifact-shape.mjs';
import { assertRequirementCoverage } from '../assert/requirement-coverage.mjs';
import { assertTraceability } from '../assert/traceability.mjs';

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node skills/design/scripts/finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'design'
    || input.agent?.type !== 'enterprise-harness:artifact-worker'
    || input.agent?.skill !== 'design') {
    throw new Error('EH-DESIGN-FINALIZE-000: handoff must be a design artifact-worker execute run');
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-DESIGN-FINALIZE-000: handoff input digest is stale: ${ref}`);
    }
  }
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const requirementsPath = path.join(changeDir, 'requirements.md');
  const designPath = path.join(changeDir, 'design.md');
  if (!fs.existsSync(requirementsPath) || !fs.existsSync(designPath)) {
    throw new Error('EH-DESIGN-FINALIZE-001: requirements.md and design.md are required');
  }
  const requirements = fs.readFileSync(requirementsPath, 'utf-8');
  const design = fs.readFileSync(designPath, 'utf-8');
  const requirementRef = `harness/changes/${changeId}/requirements.md`;
  const designRef = `harness/changes/${changeId}/design.md`;
  const checks = [
    assertArtifactShape(design, designRef),
    assertRequirementCoverage(requirements, design, requirementRef, designRef),
    assertTraceability(requirements, design, requirementRef, designRef),
  ];
  const failures = checks.flatMap((check) => check.problems);
  if (failures.length > 0) {
    throw new Error(`EH-DESIGN-FINALIZE-002: ${failures.join('; ')}`);
  }
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId,
    producer: {
      agentType: input.agent.type,
      skill: input.agent.skill,
    },
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: checks.map(({ id, verdict, evidence }) => ({ id, verdict, evidence })),
    selfCheck: {
      verdict: 'pass',
      findings: [],
      evidence: checks.flatMap(({ evidence }) => evidence),
    },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const problems = validateStageResult(root, result);
  if (problems.length > 0) throw new Error(`EH-DESIGN-FINALIZE-003: ${problems.join('; ')}`);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
