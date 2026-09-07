import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { archiveManifestInputRefs } from '../../../runtime/api/archive.mjs';
import { loadHandoffV2FromMarker, parseHandoffV2Marker } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';

const marker = parseHandoffV2Marker(process.argv.slice(2).join(' '));
try {
  if (!marker) throw new Error('EH-ARCHIVE-PREPARE-000: HANDOFF_INPUT marker is required');
  const root = process.cwd();
  const loaded = loadHandoffV2FromMarker(root, marker, { agentType: 'enterprise-harness:artifact-worker' });
  if (!loaded.ok) throw new Error(`EH-ARCHIVE-PREPARE-000: ${loaded.problems.join('; ')}`);
  const input = loaded.envelope;
  assertSafeId(input.changeId, 'changeId');
  assertSafeRunId(input.runId, 'runId');
  if (input.stage !== 'archive' || input.role !== 'execute' || input.behavior !== 'archive'
      || input.agent?.skill !== 'archive') {
    throw new Error('EH-ARCHIVE-PREPARE-001: handoff must be an archive artifact-worker execute run');
  }
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), input.changeId, 'changeId');
  const statePath = path.join(changeDir, 'state.json');
  assertNoSymlinkComponents(changeDir, statePath, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'archive'
      || state.validation?.status !== 'fresh') {
    throw new Error('EH-ARCHIVE-PREPARE-002: v6 change must be active at archive with fresh validation');
  }
  const requiredRefs = archiveManifestInputRefs(input.changeId);
  for (const [label, ref] of Object.entries(requiredRefs)) {
    const target = path.join(root, ref);
    assertNoSymlinkComponents(changeDir, target, label);
    if (!fs.existsSync(target)) throw new Error(`EH-ARCHIVE-PREPARE-003: missing ${ref}`);
    if (!input.inputRefs.includes(ref)) throw new Error(`EH-ARCHIVE-PREPARE-004: ${ref} must be digest-bound`);
  }
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-ARCHIVE-PREPARE-005: input digest is stale: ${ref}`);
    }
  }
  process.stdout.write(`${JSON.stringify({
    changeId: input.changeId,
    runId: input.runId,
    stage: 'archive',
    handoffPath: marker,
    inputRefs: [...input.inputRefs],
    inputDigests: { ...input.inputDigests },
    outputRefs: [
      `harness/changes/${input.changeId}/evidence/archive-manifest.json`,
      `harness/changes/${input.changeId}/evidence/archive-manifest-attestation.json`,
    ],
  }, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
