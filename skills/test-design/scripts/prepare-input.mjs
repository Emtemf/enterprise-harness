import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  loadHandoffV2FromMarker,
  parseHandoffV2Marker,
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
} from '../../../runtime/api/design.mjs';

function requiredFile(changeDir, name) {
  const target = path.join(changeDir, name);
  assertNoSymlinkComponents(changeDir, target, name);
  if (!fs.existsSync(target)) throw new Error(`EH-TEST-DESIGN-PREPARE-001: missing ${name}`);
  return target;
}

function sameDigestMap(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function assertDispatch(input) {
  if (input.stage !== 'design'
      || input.role !== 'execute'
      || input.behavior !== 'design.test-cases'
      || input.agent?.type !== 'enterprise-harness:test-design-worker'
      || input.agent?.skill !== 'test-design') {
    throw new Error('EH-TEST-DESIGN-PREPARE-002: handoff must be a design.test-cases test-design-worker execute run');
  }
}

function assertBound(input, ref, message) {
  if (!ref || !input.inputRefs.includes(ref)) throw new Error(message);
}

const marker = parseHandoffV2Marker(process.argv.slice(2).join(' '));

try {
  if (!marker) throw new Error('EH-TEST-DESIGN-PREPARE-000: HANDOFF_INPUT marker is required');
  const root = process.cwd();
  const loaded = loadHandoffV2FromMarker(root, marker);
  if (!loaded.ok) throw new Error(`EH-TEST-DESIGN-PREPARE-000: ${loaded.problems.join('; ')}`);
  const input = loaded.envelope;
  assertSafeId(input.changeId, 'changeId');
  assertSafeRunId(input.runId, 'runId');
  assertDispatch(input);

  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), input.changeId, 'changeId');
  const state = JSON.parse(fs.readFileSync(requiredFile(changeDir, 'state.json'), 'utf-8'));
  if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'design') {
    throw new Error('EH-TEST-DESIGN-PREPARE-003: v6 change must be active at design stage');
  }
  requiredFile(changeDir, 'requirements.md');
  requiredFile(changeDir, 'design.md');
  const requirementsRef = `harness/changes/${input.changeId}/requirements.md`;
  const designRef = `harness/changes/${input.changeId}/design.md`;
  const classificationRef = state.artifacts?.classification?.path;
  const architectureRef = designArchitectureProofRef(input.changeId);
  assertBound(input, requirementsRef, 'EH-TEST-DESIGN-PREPARE-004: requirements input must be digest-bound');
  assertBound(input, classificationRef, 'EH-TEST-DESIGN-PREPARE-005: classification input must be digest-bound');
  assertBound(input, designRef, 'EH-TEST-DESIGN-PREPARE-006: design input must be digest-bound');
  assertBound(input, architectureRef, 'EH-TEST-DESIGN-PREPARE-007: architecture proof must be digest-bound');

  const architectureProof = readDesignArchitectureProof(root, input.changeId);
  const architectureResultPath = v2ResultPath(root, input.changeId, architectureProof.executionRunId);
  const architectureResultRef = path.relative(root, architectureResultPath).split(path.sep).join('/');
  assertBound(input, architectureResultRef, 'EH-TEST-DESIGN-PREPARE-008: architecture StageResult must be digest-bound');
  const architectureResult = JSON.parse(fs.readFileSync(architectureResultPath, 'utf-8'));
  const resultProblems = validateStageResult(root, architectureResult);
  if (resultProblems.length > 0
      || architectureResult.changeId !== input.changeId
      || architectureResult.stage !== 'design'
      || architectureResult.runId !== architectureProof.executionRunId
      || architectureResult.status !== 'pass'
      || architectureResult.artifacts?.length !== 1
      || architectureResult.artifacts[0]?.path !== designRef
      || architectureResult.artifacts[0]?.digest !== architectureProof.artifacts[0]?.digest
      || !sameDigestMap(architectureResult.inputDigests, architectureProof.inputDigests)) {
    throw new Error(`EH-TEST-DESIGN-PREPARE-009: architecture StageResult does not match ArchitectureProof${resultProblems.length ? `: ${resultProblems.join('; ')}` : ''}`);
  }
  const classification = readClassificationArtifact(root, input.changeId, state.artifacts.classification);
  process.stdout.write(`${JSON.stringify({
    changeId: input.changeId,
    runId: input.runId,
    stage: 'design',
    handoffPath: marker,
    inputRefs: [...input.inputRefs],
    inputDigests: { ...input.inputDigests },
    impact: { ...classification.impact },
    outputRef: `harness/changes/${input.changeId}/test-cases.md`,
  }, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
