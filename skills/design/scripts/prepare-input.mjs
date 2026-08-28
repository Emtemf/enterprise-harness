import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sha256Artifact } from '../../../runtime/api/result.mjs';
import {
  loadHandoffV2FromMarker,
  parseHandoffV2Marker,
  readClassificationArtifact,
} from '../../../runtime/api/handoff.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  assertSafeRunId,
  resolveChild,
} from '../../../runtime/api/task.mjs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function requiredFile(changeDir, name) {
  const file = path.join(changeDir, name);
  assertNoSymlinkComponents(changeDir, file, name);
  if (!fs.existsSync(file)) throw new Error(`EH-DESIGN-PREPARE-001: missing ${name}`);
  return file;
}

function assertCanonicalInputs(handoff, requirementsRef, classificationRef) {
  if (!handoff.inputRefs.includes(requirementsRef)) {
    throw new Error('EH-DESIGN-PREPARE-005: requirements input must be digest-bound');
  }
  if (!classificationRef || !handoff.inputRefs.includes(classificationRef)) {
    throw new Error('EH-DESIGN-PREPARE-006: classification input must be digest-bound');
  }
}

const markerInput = process.argv.slice(2).join(' ');
if (!markerInput) {
  console.error('Usage: node skills/design/scripts/prepare-input.mjs HANDOFF_INPUT=<canonical-input.json-path>');
  process.exit(2);
}

try {
  const marker = parseHandoffV2Marker(markerInput);
  if (!marker) throw new Error('EH-DESIGN-PREPARE-000: HANDOFF_INPUT marker is required');
  const root = process.cwd();
  const loaded = loadHandoffV2FromMarker(root, marker, { agentType: 'enterprise-harness:artifact-worker' });
  if (!loaded.ok) throw new Error(`EH-DESIGN-PREPARE-000: ${loaded.problems.join('; ')}`);
  const handoff = loaded.envelope;
  const { changeId, runId } = handoff;
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId, 'runId');
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  if (handoff.role !== 'execute' || handoff.stage !== 'design'
    || handoff.agent?.type !== 'enterprise-harness:artifact-worker'
    || handoff.agent?.skill !== 'design') {
    throw new Error('EH-DESIGN-PREPARE-003: handoff must be a design artifact-worker execute run');
  }
  const state = readJson(requiredFile(changeDir, 'state.json'));
  if (state.schemaVersion !== 6 || state.stage !== 'design') {
    throw new Error('EH-DESIGN-PREPARE-002: v6 change must be at design stage');
  }
  requiredFile(changeDir, 'requirements.md');
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const classificationRef = state.artifacts?.classification?.path;
  assertCanonicalInputs(handoff, requirementsRef, classificationRef);
  const classification = readClassificationArtifact(root, changeId, state.artifacts?.classification);
  for (const ref of handoff.inputRefs) {
    if (sha256Artifact(root, ref) !== handoff.inputDigests[ref]) {
      throw new Error(`EH-DESIGN-PREPARE-004: handoff input digest is stale: ${ref}`);
    }
  }
  const conditionalReferences = ['references/method.md', 'references/quality-design.md'];
  if (classification.impact.api === 'yes') conditionalReferences.push('references/api-design.md');
  if (classification.impact.data === 'yes') conditionalReferences.push('references/data-design.md');
  process.stdout.write(JSON.stringify({
    inputVersion: 1,
    changeId,
    runId,
    handoffPath: marker,
    stage: 'design',
    classification,
    inputRefs: [...handoff.inputRefs],
    inputDigests: { ...handoff.inputDigests },
    conditionalReferences,
  }, null, 2) + '\n');
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
