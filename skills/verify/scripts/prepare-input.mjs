import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2FromMarker, parseHandoffV2Marker } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateCanonicalDesignProof } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';

function required(changeDir, name) {
  const target = path.join(changeDir, name);
  assertNoSymlinkComponents(changeDir, target, name);
  if (!fs.existsSync(target)) throw new Error(`EH-VERIFY-PREPARE-001: missing ${name}`);
  return target;
}

const marker = parseHandoffV2Marker(process.argv.slice(2).join(' '));
try {
  if (!marker) throw new Error('EH-VERIFY-PREPARE-000: HANDOFF_INPUT marker is required');
  const root = process.cwd();
  const loaded = loadHandoffV2FromMarker(root, marker, { agentType: 'enterprise-harness:artifact-worker' });
  if (!loaded.ok) throw new Error(`EH-VERIFY-PREPARE-000: ${loaded.problems.join('; ')}`);
  const input = loaded.envelope;
  assertSafeId(input.changeId, 'changeId');
  assertSafeRunId(input.runId, 'runId');
  if (input.stage !== 'verify' || input.role !== 'execute' || input.behavior !== 'verify.collect'
      || input.agent?.skill !== 'verify') {
    throw new Error('EH-VERIFY-PREPARE-002: handoff must be a verify.collect artifact-worker execute run');
  }
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), input.changeId, 'changeId');
  const state = JSON.parse(fs.readFileSync(required(changeDir, 'state.json'), 'utf-8'));
  if (state.schemaVersion !== 6 || state.lifecycle !== 'active' || state.stage !== 'verify') {
    throw new Error('EH-VERIFY-PREPARE-003: v6 change must be active at verify stage');
  }
  required(changeDir, 'test-cases.md');
  const testCasesRef = `harness/changes/${input.changeId}/test-cases.md`;
  if (!input.inputRefs.includes(testCasesRef)) throw new Error('EH-VERIFY-PREPARE-004: test-cases input must be digest-bound');
  const designProofRef = `harness/changes/${input.changeId}/evidence/completion/design.json`;
  required(changeDir, 'evidence/completion/design.json');
  if (!input.inputRefs.includes(designProofRef)) throw new Error('EH-VERIFY-PREPARE-004: compound DesignProof input must be digest-bound');
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) throw new Error(`EH-VERIFY-PREPARE-005: input digest is stale: ${ref}`);
  }
  const canonicalDesignProblems = validateCanonicalDesignProof(root, input.changeId);
  if (canonicalDesignProblems.length > 0) {
    throw new Error(`EH-VERIFY-PREPARE-006: canonical compound DesignProof is invalid: ${canonicalDesignProblems.join('; ')}`);
  }
  process.stdout.write(`${JSON.stringify({ changeId: input.changeId, runId: input.runId, stage: 'verify', handoffPath: marker, inputRefs: [...input.inputRefs], inputDigests: { ...input.inputDigests }, outputRef: `harness/changes/${input.changeId}/validation.md` }, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
