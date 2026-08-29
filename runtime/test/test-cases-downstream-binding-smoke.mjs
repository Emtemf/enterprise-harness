import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import { artifactDependencies } from '../lib/artifacts.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { archiveManifestAttestationRef, validateArchiveManifest } from '../api/archive.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { writeCanonicalVerifyCompletionFixture } from './verify-completion-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const archiveFinalize = path.join(sourceRoot, 'skills/archive/scripts/finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-test-cases-downstream-'));
const changeId = 'downstream-slice';
const base = `harness/changes/${changeId}`;
const validationRef = `${base}/validation.md`;
const verifyProofRef = `${base}/evidence/completion/verify.json`;
const testCasesRef = `${base}/test-cases.md`;
const designProofRef = `${base}/evidence/completion/design.json`;
const manifestRef = `${base}/evidence/archive-manifest.json`;

try {
  const graph = artifactDependencies();
  assert.deepEqual(graph.plan, ['design', 'testCases']);
  assert.deepEqual(graph.validation, ['requirements', 'design', 'testCases', 'plan', 'evidence']);

  fs.mkdirSync(path.join(root, base, 'evidence', 'completion'), { recursive: true });
  fs.writeFileSync(path.join(root, validationRef), '# Validation\n\n## Commands\n- node --test\n\n## Results\n- pass\n\n## Freshness\n- fresh\n\n## Coverage and exceptions\n- TC1 | executed | evidence/tasks/task-1.json\n');
  fs.writeFileSync(path.join(root, verifyProofRef), JSON.stringify({ type: 'completion-proof', stage: 'verify' }));
  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n');
  fs.writeFileSync(path.join(root, designProofRef), JSON.stringify({
    type: 'completion-proof', stage: 'design',
    stageProofs: [{ kind: 'test-design', executionRunId: 'run_test-design-execute', reviewRunId: 'run_test-design-review' }],
  }));
  const missingTestCases = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs: [validationRef, verifyProofRef, testCasesRef, designProofRef],
    tecpc: { target: 'archive missing test cases', evidence: [validationRef, verifyProofRef], context: [testCasesRef, designProofRef], path: manifestRef, correction: null },
  });
  fs.renameSync(path.join(root, testCasesRef), path.join(root, `${testCasesRef}.missing`));
  const missing = spawnSync(process.execPath, [archiveFinalize, changeId, missingTestCases.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(missing.status, 0, 'archive must reject missing test-cases.md');
  assert.match(missing.stderr, /testCases.*unreadable|test-cases\.md/u);
  fs.renameSync(path.join(root, `${testCasesRef}.missing`), path.join(root, testCasesRef));
  // GREEN fixture: an Archive success must consume actual trusted Design and
  // Verify chains, not the shallow JSON used by the RED probe above.
  fs.writeFileSync(path.join(root, testCasesRef), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable | cleanup | accepted |',
  ].join('\n'));
  writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'verify' });
  const verify = writeCanonicalVerifyCompletionFixture(root, changeId);
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs: [verify.validationRef, verify.verifyProofRef, verify.testCasesRef, verify.designProofRef],
    tecpc: { target: 'archive downstream evidence', evidence: [verify.validationRef, verify.verifyProofRef], context: [verify.testCasesRef, verify.designProofRef], path: manifestRef, correction: null },
  });
  const result = spawnSync(process.execPath, [archiveFinalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, manifestRef)), true, 'archive must persist one immutable canonical manifest');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestRef), 'utf-8'));
  const archiveStageResult = JSON.parse(result.stdout);
  assert.equal(manifest.testCases.path, testCasesRef);
  assert.equal(manifest.designProof.path, designProofRef);
  assert.equal(manifest.verifyCompletionProof.path, verifyProofRef);
  assert.equal(manifest.archiveRunId, handoff.runId);
  const attestationRef = archiveManifestAttestationRef(changeId);
  assert.equal(fs.existsSync(path.join(root, attestationRef)), true,
    'the canonical archive writer must persist an immutable manifest attestation');
  const originalAttestation = fs.readFileSync(path.join(root, attestationRef), 'utf-8');
  fs.rmSync(path.join(root, attestationRef));
  assert.match(validateArchiveManifest(root, changeId, {
    expectedArchiveRunId: handoff.runId,
    expectedInputDigests: handoff.input.inputDigests,
  }).join('\n'), /archive manifest attestation/u,
  'a semantically valid, byte-valid manifest without the canonical runtime writer attestation must fail closed');
  fs.writeFileSync(path.join(root, attestationRef), originalAttestation);
  assert.equal(validateArchiveManifest(root, changeId, {
    expectedArchiveRunId: handoff.runId,
    expectedInputDigests: handoff.input.inputDigests,
  }).length, 0, 'manifest plus canonical attestation must bind the current closure');
  const attestationArtifact = archiveStageResult.artifacts.find((artifact) => artifact.path === attestationRef);
  assert.deepEqual(attestationArtifact, {
    path: attestationRef,
    digest: sha256Artifact(root, attestationRef),
  }, 'Archive StageResult must bind the exact canonical attestation ref and digest');

  const originalAttestationObject = JSON.parse(originalAttestation);
  for (const [label, forgedAttestation] of [
    ['wrong archive run', { ...originalAttestationObject, archiveRunId: 'run_11111111-1111-4111-8111-111111111111' }],
    ['wrong manifest digest', { ...originalAttestationObject, manifest: { ...originalAttestationObject.manifest, digest: '0'.repeat(64) } }],
    ['rogue manifest ref', { ...originalAttestationObject, manifest: { ...originalAttestationObject.manifest, path: `${base}/evidence/rogue-manifest.json` } }],
  ]) {
    fs.writeFileSync(path.join(root, attestationRef), JSON.stringify(forgedAttestation));
    assert.match(validateArchiveManifest(root, changeId, {
      expectedArchiveRunId: handoff.runId,
      expectedInputDigests: handoff.input.inputDigests,
    }).join('\n'), /archive manifest attestation/u, `${label} attestation must fail closed`);
  }
  fs.writeFileSync(path.join(root, attestationRef), originalAttestation);
  const externalAttestation = path.join(root, 'external-archive-manifest-attestation.json');
  fs.copyFileSync(path.join(root, attestationRef), externalAttestation);
  fs.rmSync(path.join(root, attestationRef));
  fs.symlinkSync(externalAttestation, path.join(root, attestationRef));
  assert.match(validateArchiveManifest(root, changeId, {
    expectedArchiveRunId: handoff.runId,
    expectedInputDigests: handoff.input.inputDigests,
  }).join('\n'), /symbolic-link/u, 'attestation validation must reject a symlink even with a valid target');
  fs.rmSync(path.join(root, attestationRef));
  fs.copyFileSync(externalAttestation, path.join(root, attestationRef));

  const duplicate = spawnSync(process.execPath, [archiveFinalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(duplicate.status, 0, duplicate.stderr || 'identical archive writer retry must be idempotent');
  assert.deepEqual(JSON.parse(duplicate.stdout).artifacts.find((artifact) => artifact.path === attestationRef), attestationArtifact,
    'idempotent writer retry must preserve the attestation artifact identity');
  const conflictingHandoff = createHandoffV2(root, {
    changeId,
    stage: 'archive',
    behavior: 'archive',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'archive' },
    inputRefs: [verify.validationRef, verify.verifyProofRef, verify.testCasesRef, verify.designProofRef],
    tecpc: { target: 'conflicting archive writer', evidence: [verify.validationRef, verify.verifyProofRef], context: [verify.testCasesRef, verify.designProofRef], path: manifestRef, correction: null },
  });
  const conflictingWriter = spawnSync(process.execPath, [archiveFinalize, changeId, conflictingHandoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(conflictingWriter.status, 0, 'a second archive run must fail closed against an existing immutable manifest/attestation pair');
  assert.match(conflictingWriter.stderr, /immutable archive manifest\/attestation conflict/u);

  const externalManifest = path.join(root, 'external-archive-manifest.json');
  fs.copyFileSync(path.join(root, manifestRef), externalManifest);
  fs.rmSync(path.join(root, manifestRef));
  fs.symlinkSync(externalManifest, path.join(root, manifestRef));
  assert.match(
    validateArchiveManifest(root, changeId, { expectedArchiveRunId: handoff.runId, expectedInputDigests: handoff.input.inputDigests }).join('\n'),
    /symbolic-link/u,
    'manifest validation must reject a symlink even when the target has valid JSON',
  );
  fs.rmSync(path.join(root, manifestRef));
  fs.copyFileSync(externalManifest, path.join(root, manifestRef));

  const forged = { ...manifest, testDesign: { ...manifest.testDesign, reviewRunId: manifest.testDesign.executionRunId } };
  fs.writeFileSync(path.join(root, manifestRef), JSON.stringify(forged));
  assert.match(
    validateArchiveManifest(root, changeId, { expectedArchiveRunId: handoff.runId, expectedInputDigests: handoff.input.inputDigests }).join('\n'),
    /testDesign.*canonical trusted independent/u,
    'a hand-written manifest cannot swap a trusted test-design review run',
  );
  console.log(`PASS test-cases-downstream-binding ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
