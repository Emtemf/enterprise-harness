import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2FromMarker, parseHandoffV2Marker } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';

function required(changeDir, name) {
  const target = path.join(changeDir, name);
  assertNoSymlinkComponents(changeDir, target, name);
  if (!fs.existsSync(target)) throw new Error(`EH-PLAN-PREPARE-001: missing ${name}`);
  return target;
}

function bound(input, ref, message) {
  if (!input.inputRefs.includes(ref)) throw new Error(message);
}

const marker = parseHandoffV2Marker(process.argv.slice(2).join(' '));
try {
  if (!marker) throw new Error('EH-PLAN-PREPARE-000: HANDOFF_INPUT marker is required');
  const root = process.cwd();
  const loaded = loadHandoffV2FromMarker(root, marker, { agentType: 'enterprise-harness:artifact-worker' });
  if (!loaded.ok) throw new Error(`EH-PLAN-PREPARE-000: ${loaded.problems.join('; ')}`);
  const input = loaded.envelope;
  assertSafeId(input.changeId, 'changeId');
  assertSafeRunId(input.runId, 'runId');
  if (input.stage !== 'plan' || input.role !== 'execute' || input.behavior !== 'plan.produce'
      || input.agent?.skill !== 'plan') {
    throw new Error('EH-PLAN-PREPARE-002: handoff must be a plan.produce artifact-worker execute run');
  }
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), input.changeId, 'changeId');
  const state = JSON.parse(fs.readFileSync(required(changeDir, 'state.json'), 'utf-8'));
  if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'plan') {
    throw new Error('EH-PLAN-PREPARE-003: v6 change must be active at plan stage');
  }
  for (const name of ['design.md', 'test-cases.md', 'evidence/completion/design.json']) required(changeDir, name);
  const base = `harness/changes/${input.changeId}`;
  const refs = [`${base}/design.md`, `${base}/test-cases.md`, `${base}/evidence/completion/design.json`];
  bound(input, refs[0], 'EH-PLAN-PREPARE-004: design input must be digest-bound');
  bound(input, refs[1], 'EH-PLAN-PREPARE-005: test-cases input must be digest-bound');
  bound(input, refs[2], 'EH-PLAN-PREPARE-006: compound DesignProof input must be digest-bound');
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) throw new Error(`EH-PLAN-PREPARE-007: input digest is stale: ${ref}`);
  }
  process.stdout.write(`${JSON.stringify({ changeId: input.changeId, runId: input.runId, stage: 'plan', handoffPath: marker, inputRefs: [...input.inputRefs], inputDigests: { ...input.inputDigests }, outputRef: `${base}/tasks.md` }, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
