import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  archiveManifestAttestationRef,
  archiveManifestInputRefs,
  archiveManifestRef,
  validateArchiveManifest,
} from '../api/archive.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { writeCanonicalVerifyCompletionFixture } from './verify-completion-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const skill = fs.readFileSync(path.join(sourceRoot, 'skills', 'archive', 'SKILL.md'), 'utf-8');
assert.match(skill, /禁止用 Bash `cat`\/`ls`\/`find`/u);
assert.match(skill, /不能手工拼装/u);
const prepare = path.join(sourceRoot, 'skills', 'archive', 'scripts', 'prepare-input.mjs');
const finalize = path.join(sourceRoot, 'skills', 'archive', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-archive-skill-'));
const changeId = 'archive-skill-standard';
const base = `harness/changes/${changeId}`;

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Fixture contract\n');
  writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'verify' });
  const verify = writeCanonicalVerifyCompletionFixture(root, changeId);
  const statePath = path.join(root, base, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  fs.writeFileSync(statePath, `${JSON.stringify({
    ...state,
    revision: state.revision + 1,
    stage: 'archive',
    validation: { status: 'fresh', digest: sha256Artifact(root, verify.validationRef), validatedAt: '2026-09-06T00:00:00.000Z' },
  }, null, 2)}\n`);
  const inputRefs = Object.values(archiveManifestInputRefs(changeId));
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs,
    tecpc: {
      target: '封存标准变更的完整证据链',
      evidence: [verify.validationRef, verify.verifyProofRef],
      context: inputRefs,
      path: `${verify.verifyProofRef} -> archive manifest`,
      correction: null,
    },
  });
  const marker = `HANDOFF_INPUT=${path.relative(root, handoff.path).split(path.sep).join('/')}`;
  const incompleteHandoff = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs: [verify.validationRef, verify.verifyProofRef],
    tecpc: { target: 'incomplete archive', evidence: [verify.verifyProofRef], context: [verify.validationRef], path: 'incomplete', correction: null },
  });
  const incompleteMarker = `HANDOFF_INPUT=${path.relative(root, incompleteHandoff.path).split(path.sep).join('/')}`;
  const incomplete = spawnSync(process.execPath, [prepare, incompleteMarker], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /must be digest-bound/u);
  const prepared = spawnSync(process.execPath, [prepare, marker], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.deepEqual(JSON.parse(prepared.stdout).inputRefs, inputRefs);

  const staleContent = fs.readFileSync(path.join(root, verify.tasksRef), 'utf-8');
  fs.appendFileSync(path.join(root, verify.tasksRef), '\n<!-- stale -->\n');
  const stale = spawnSync(process.execPath, [prepare, marker], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /stale/u);
  fs.writeFileSync(path.join(root, verify.tasksRef), staleContent);

  const blockedAttestationPath = path.join(root, archiveManifestAttestationRef(changeId));
  fs.mkdirSync(blockedAttestationPath, { recursive: true });
  const partialWrite = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(partialWrite.status, 0);
  assert.match(partialWrite.stderr, /EH-ARCHIVE-MANIFEST-002/u);
  assert.equal(fs.existsSync(path.join(root, archiveManifestRef(changeId))), false,
    'attestation failure must roll back the newly written manifest');
  fs.rmSync(blockedAttestationPath, { recursive: true, force: true });

  const finalized = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(finalized.status, 0, finalized.stderr);
  const result = JSON.parse(finalized.stdout);
  assert.equal(result.status, 'pass');
  assert.ok(fs.existsSync(v2ResultPath(root, changeId, handoff.runId)), 'finalizer must persist the StageResult itself');
  assert.deepEqual(result.artifacts.slice(0, inputRefs.length).map(({ path: ref }) => ref), [...inputRefs].sort());
  assert.deepEqual(validateArchiveManifest(root, changeId, {
    expectedArchiveRunId: handoff.runId,
    expectedInputDigests: handoff.input.inputDigests,
  }), []);
  const duplicate = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /durable result already exists/u);
  console.log(`PASS archive-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
