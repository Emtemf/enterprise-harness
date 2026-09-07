// Runtime-owned Archive manifest authority.  Archive Skills use the public
// facade; stage gates call this same validator so a worker cannot bypass the
// contract by emitting a hand-written StageResult.
import fs from 'node:fs';
import path from 'node:path';
import { stageCompletionFor } from './stage-results.mjs';
import { withChangeTransaction } from './state-store.mjs';
import { sha256Artifact } from './result-contract.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  assertSafeRunId,
  isSafeRelativePath,
  resolveChild,
  resolveWithin,
} from './safe-paths.mjs';

const DIGEST = /^[a-f0-9]{64}$/u;
const MANIFEST_FIELDS = new Set([
  'manifestVersion', 'type', 'changeId', 'archiveRunId', 'inputDigests',
  'verifyCompletionProof', 'validation', 'testCases', 'designProof', 'testDesign', 'lineage', 'createdAt',
]);
const ATTESTATION_FIELDS = new Set([
  'receiptVersion', 'type', 'provenance', 'changeId', 'archiveRunId',
  'manifest', 'inputDigests', 'createdAt',
]);
const ARCHIVE_ARTIFACT_FIELDS = new Set(['path', 'archivePath', 'digest']);
const TEST_DESIGN_FIELDS = new Set(['executionRunId', 'reviewRunId']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exact(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactDigestMap(left, right) {
  return exact(
    Object.entries(left || {}).sort(([a], [b]) => a.localeCompare(b)),
    Object.entries(right || {}).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function rejectUnknown(value, label, fields, problems) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) if (!fields.has(key)) problems.push(`${label} has unknown property ${key}`);
}

function archivePathFor(changeId, ref) {
  const sourcePrefix = `harness/changes/${changeId}/`;
  if (!isSafeRelativePath(ref) || !ref.startsWith(sourcePrefix)) {
    throw new Error(`archive input must belong to ${sourcePrefix}`);
  }
  return `harness/archive/${changeId}/${ref.slice(sourcePrefix.length)}`;
}

function artifact(root, changeDir, ref, label, problems) {
  if (!isSafeRelativePath(ref)) {
    problems.push(`${label} must be a safe artifact reference`);
    return null;
  }
  try {
    const target = resolveWithin(root, ref, label);
    const changeId = path.basename(changeDir);
    const archivePath = archivePathFor(changeId, ref);
    assertNoSymlinkComponents(changeDir, target, label);
    if (!fs.existsSync(target)) throw new Error('file is missing');
    return { path: ref, archivePath, digest: sha256Artifact(root, ref) };
  } catch (error) {
    problems.push(`${label} is unreadable: ${ref} (${error.message})`);
    return null;
  }
}

function verifyArtifactBinding(root, changeDir, actual, expected, label, problems) {
  rejectUnknown(actual, label, ARCHIVE_ARTIFACT_FIELDS, problems);
  if (!isObject(actual)
    || actual.path !== expected?.path
    || actual.archivePath !== expected?.archivePath
    || actual.digest !== expected?.digest) {
    problems.push(`${label} must exactly bind current ${expected?.path || 'canonical artifact'}`);
    return;
  }
  const current = artifact(root, changeDir, actual.path, label, problems);
  if (current && current.digest !== actual.digest) problems.push(`${label} digest is stale: ${actual.path}`);
}

export function archiveManifestRef(changeId) {
  assertSafeId(changeId, 'changeId');
  return `harness/changes/${changeId}/evidence/archive-manifest.json`;
}

// This is an unsigned runtime receipt, analogous to the repository's other
// trusted evidence records. It proves durable runtime-path provenance within
// this repository model, not authorship against a hostile filesystem owner.
export function archiveManifestAttestationRef(changeId) {
  assertSafeId(changeId, 'changeId');
  return `harness/changes/${changeId}/evidence/archive-manifest-attestation.json`;
}

export function archiveManifestInputRefs(changeId) {
  assertSafeId(changeId, 'changeId');
  const base = `harness/changes/${changeId}`;
  return {
    requirements: `${base}/requirements.md`,
    classification: `${base}/classification.json`,
    debtAssessment: `${base}/debt-assessment.json`,
    projectContractAssessment: `${base}/project-contract-assessment.json`,
    decisionSnapshot: `${base}/evidence/decisions/clarify-decision-snapshot.json`,
    design: `${base}/design.md`,
    validation: `${base}/validation.md`,
    verifyCompletionProof: `${base}/evidence/completion/verify.json`,
    testCases: `${base}/test-cases.md`,
    designProof: `${base}/evidence/completion/design.json`,
    tasks: `${base}/tasks.md`,
    taskCommands: `${base}/task-commands.json`,
    planProof: `${base}/evidence/completion/plan.json`,
    implementProof: `${base}/evidence/completion/implement.json`,
  };
}

function canonicalArchiveInputs(root, changeId, inputDigests = null) {
  const problems = [];
  let changeDir = null;
  try { changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId'); } catch (error) { problems.push(error.message); }
  if (!changeDir) return { problems, expected: null };
  const refs = archiveManifestInputRefs(changeId);
  const expected = Object.fromEntries(Object.entries(refs).map(([key, ref]) => [key, artifact(root, changeDir, ref, key, problems)]));
  if (inputDigests !== null) {
    if (!isObject(inputDigests)) {
      problems.push('archive inputDigests must be an object');
    } else {
      for (const ref of Object.values(refs)) {
        if (inputDigests[ref] !== expected[Object.keys(refs).find((key) => refs[key] === ref)]?.digest) {
          problems.push(`archive input must digest-bind current ${ref}`);
        }
      }
      for (const [ref, digest] of Object.entries(inputDigests)) {
        const current = artifact(root, changeDir, ref, `archive input ${ref}`, problems);
        if (current && current.digest !== digest) problems.push(`archive input digest is stale: ${ref}`);
      }
    }
  }

  const design = stageCompletionFor(root, changeId, 'design', {
    requiredArtifactPath: refs.designProof.replace('/evidence/completion/design.json', '/design.md'),
  });
  if (design.proof.status !== 'pass' || !design.candidateProof) {
    problems.push(...(design.problems.length > 0 ? design.problems : ['canonical compound DesignProof is unavailable'])
      .map((problem) => `canonical compound DesignProof: ${problem}`));
  }

  const verify = stageCompletionFor(root, changeId, 'verify', {
    requiredArtifactPath: refs.validation,
  });
  if (verify.proof.status !== 'pass' || !verify.candidateProof) {
    problems.push(...(verify.problems.length > 0 ? verify.problems : ['canonical Verify CompletionProof is unavailable'])
      .map((problem) => `canonical Verify CompletionProof: ${problem}`));
  }

  let testDesign = null;
  if (design.candidateProof) {
    const proof = design.candidateProof;
    const testDesignProof = proof.stageProofs?.find((entry) => entry.kind === 'test-design');
    if (!testDesignProof?.executionRunId || !testDesignProof?.reviewRunId) {
      problems.push('canonical compound DesignProof must bind a test-design execute/review chain');
    } else {
      testDesign = {
        executionRunId: testDesignProof.executionRunId,
        reviewRunId: testDesignProof.reviewRunId,
      };
    }
  }
  return { problems: [...new Set(problems)], expected: { refs, artifacts: expected, design, verify, testDesign } };
}

function expectedManifest(root, changeId, archiveRunId, inputDigests) {
  const canonical = canonicalArchiveInputs(root, changeId, inputDigests);
  if (canonical.problems.length > 0) return { manifest: null, problems: canonical.problems };
  const { artifacts, testDesign } = canonical.expected;
  return {
    manifest: {
      manifestVersion: 2,
      type: 'archive-manifest',
      changeId,
      archiveRunId,
      inputDigests: { ...inputDigests },
      verifyCompletionProof: artifacts.verifyCompletionProof,
      validation: artifacts.validation,
      testCases: artifacts.testCases,
      designProof: artifacts.designProof,
      testDesign,
      lineage: Object.keys(inputDigests).sort().map((ref) => ({
        path: ref,
        archivePath: archivePathFor(changeId, ref),
        digest: inputDigests[ref],
      })),
    },
    problems: [],
  };
}

function expectedAttestation({ changeId, archiveRunId, manifest, inputDigests }) {
  return {
    receiptVersion: 2,
    type: 'archive-manifest-attestation',
    provenance: 'runtime-archive-facade',
    changeId,
    archiveRunId,
    manifest: { ...manifest },
    inputDigests: { ...inputDigests },
  };
}

function validateArchiveManifestAttestation(root, changeId, {
  expectedArchiveRunId,
  expectedManifest,
  expectedInputDigests,
} = {}) {
  const problems = [];
  let changeDir;
  let ref;
  let target;
  try {
    changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
    ref = archiveManifestAttestationRef(changeId);
    target = resolveWithin(root, ref, 'archive manifest attestation');
    assertNoSymlinkComponents(changeDir, target, 'archive manifest attestation');
    if (!fs.existsSync(target)) throw new Error('file is missing');
  } catch (error) {
    return [`archive manifest attestation is unreadable: ${error.message}`];
  }
  let attestation;
  try {
    attestation = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (error) {
    return [`archive manifest attestation is invalid JSON: ${error.message}`];
  }
  if (!isObject(attestation)) return ['archive manifest attestation must be an object'];
  rejectUnknown(attestation, 'archive manifest attestation', ATTESTATION_FIELDS, problems);
  if (attestation.receiptVersion !== 2) problems.push('archive manifest attestation receiptVersion must be 2');
  if (attestation.type !== 'archive-manifest-attestation') problems.push('archive manifest attestation type is invalid');
  if (attestation.provenance !== 'runtime-archive-facade') problems.push('archive manifest attestation provenance must be runtime-archive-facade');
  if (attestation.changeId !== changeId) problems.push(`archive manifest attestation changeId must be ${changeId}`);
  try { assertSafeRunId(attestation.archiveRunId, 'archive manifest attestation archiveRunId'); } catch (error) { problems.push(error.message); }
  if (expectedArchiveRunId && attestation.archiveRunId !== expectedArchiveRunId) {
    problems.push(`archive manifest attestation archiveRunId must be ${expectedArchiveRunId}`);
  }
  rejectUnknown(attestation.manifest, 'archive manifest attestation manifest', ARCHIVE_ARTIFACT_FIELDS, problems);
  if (!isObject(attestation.manifest)
    || attestation.manifest.path !== expectedManifest?.path
    || attestation.manifest.archivePath !== expectedManifest?.archivePath
    || attestation.manifest.digest !== expectedManifest?.digest) {
    problems.push(`archive manifest attestation must exactly bind ${expectedManifest?.path || 'the canonical archive manifest'} and its digest`);
  }
  if (!exactDigestMap(attestation.inputDigests, expectedInputDigests)) {
    problems.push('archive manifest attestation inputDigests do not exactly match the current archive closure');
  }
  if (!Number.isFinite(Date.parse(attestation.createdAt))) problems.push('archive manifest attestation createdAt must be an ISO timestamp');
  return [...new Set(problems)];
}

function createArchiveManifestUnlocked(root, { changeId, archiveRunId, inputDigests }) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(archiveRunId, 'archiveRunId');
  const built = expectedManifest(root, changeId, archiveRunId, inputDigests);
  if (built.problems.length > 0) throw new Error(`EH-ARCHIVE-MANIFEST-001: ${built.problems.join('; ')}`);
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const ref = archiveManifestRef(changeId);
  const target = resolveWithin(root, ref, 'archive manifest');
  const attestationRef = archiveManifestAttestationRef(changeId);
  const attestationTarget = resolveWithin(root, attestationRef, 'archive manifest attestation');
  assertNoSymlinkComponents(changeDir, target, 'archive manifest');
  assertNoSymlinkComponents(changeDir, attestationTarget, 'archive manifest attestation');
  const manifestExists = fs.existsSync(target);
  const attestationExists = fs.existsSync(attestationTarget);
  if (manifestExists || attestationExists) {
    if (manifestExists && attestationExists) {
      const existingProblems = validateArchiveManifest(root, changeId, {
        expectedArchiveRunId: archiveRunId,
        expectedInputDigests: inputDigests,
      });
      if (existingProblems.length === 0) {
        const manifest = JSON.parse(fs.readFileSync(target, 'utf-8'));
        return {
          path: ref,
          digest: sha256Artifact(root, ref),
          manifest,
          attestation: { path: attestationRef, digest: sha256Artifact(root, attestationRef) },
          idempotent: true,
        };
      }
      throw new Error(`EH-ARCHIVE-MANIFEST-002: immutable archive manifest/attestation conflict: ${existingProblems.join('; ')}`);
    }
    throw new Error(`EH-ARCHIVE-MANIFEST-002: archive manifest and attestation must be created together: ${ref}`);
  }
  const manifest = { ...built.manifest, createdAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
  } catch (error) {
    throw new Error(`EH-ARCHIVE-MANIFEST-002: archive manifest already exists or could not be written: ${error.message}`);
  }
  const manifestArtifact = { path: ref, archivePath: archivePathFor(changeId, ref), digest: sha256Artifact(root, ref) };
  const attestation = {
    ...expectedAttestation({ changeId, archiveRunId, manifest: manifestArtifact, inputDigests }),
    createdAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(attestationTarget, `${JSON.stringify(attestation, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw new Error(`EH-ARCHIVE-MANIFEST-003: archive manifest attestation could not be written: ${error.message}`);
  }
  return {
    ...manifestArtifact,
    manifest,
    attestation: { path: attestationRef, digest: sha256Artifact(root, attestationRef) },
    idempotent: false,
  };
}

export function createArchiveManifest(root, options) {
  assertSafeId(options?.changeId, 'changeId');
  return withChangeTransaction(root, options.changeId, () => createArchiveManifestUnlocked(root, options));
}

export function validateArchiveManifest(root, changeId, {
  expectedArchiveRunId = null,
  expectedInputDigests = null,
} = {}) {
  const problems = [];
  try { assertSafeId(changeId, 'changeId'); } catch (error) { return [error.message]; }
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const ref = archiveManifestRef(changeId);
  let target;
  try {
    target = resolveWithin(root, ref, 'archive manifest');
    assertNoSymlinkComponents(changeDir, target, 'archive manifest');
    if (!fs.existsSync(target)) throw new Error('file is missing');
  } catch (error) {
    return [`archive manifest is unreadable: ${error.message}`];
  }
  const manifestArtifact = { path: ref, archivePath: archivePathFor(changeId, ref), digest: sha256Artifact(root, ref) };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(target, 'utf-8')); } catch (error) { return [`archive manifest is invalid JSON: ${error.message}`]; }
  if (!isObject(manifest)) return ['archive manifest must be an object'];
  rejectUnknown(manifest, 'archive manifest', MANIFEST_FIELDS, problems);
  if (manifest.manifestVersion !== 2) problems.push('manifestVersion must be 2');
  if (manifest.type !== 'archive-manifest') problems.push('type must be archive-manifest');
  if (manifest.changeId !== changeId) problems.push(`changeId must be ${changeId}`);
  try { assertSafeRunId(manifest.archiveRunId, 'archiveRunId'); } catch (error) { problems.push(error.message); }
  if (expectedArchiveRunId && manifest.archiveRunId !== expectedArchiveRunId) problems.push(`archiveRunId must be ${expectedArchiveRunId}`);
  if (!Number.isFinite(Date.parse(manifest.createdAt))) problems.push('createdAt must be an ISO timestamp');
  const expectedInputs = expectedInputDigests || manifest.inputDigests;
  const built = expectedManifest(root, changeId, manifest.archiveRunId, expectedInputs);
  problems.push(...built.problems);
  if (expectedInputDigests && !exactDigestMap(manifest.inputDigests, expectedInputDigests)) {
    problems.push('manifest inputDigests do not exactly match the archive handoff');
  }
  if (built.manifest) {
    for (const key of ['verifyCompletionProof', 'validation', 'testCases', 'designProof']) {
      verifyArtifactBinding(root, changeDir, manifest[key], built.manifest[key], key, problems);
    }
    rejectUnknown(manifest.testDesign, 'testDesign', TEST_DESIGN_FIELDS, problems);
    if (!exact(manifest.testDesign, built.manifest.testDesign)) {
      problems.push('testDesign must exactly bind the canonical trusted independent execute/review chain');
    }
    if (!Array.isArray(manifest.lineage)
        || !exact(manifest.lineage, built.manifest.lineage)
        || manifest.lineage.some((entry) => {
          rejectUnknown(entry, 'lineage artifact', ARCHIVE_ARTIFACT_FIELDS, problems);
          return !isObject(entry);
        })) {
      problems.push('lineage must exactly bind every frozen archive input in canonical path order');
    }
    if (!exactDigestMap(manifest.inputDigests, built.manifest.inputDigests)) {
      problems.push('manifest inputDigests are not the current archive digest closure');
    }
  }
  problems.push(...validateArchiveManifestAttestation(root, changeId, {
    expectedArchiveRunId: expectedArchiveRunId || manifest.archiveRunId,
    expectedManifest: manifestArtifact,
    expectedInputDigests: expectedInputDigests || manifest.inputDigests,
  }));
  return [...new Set(problems)];
}

function readArchivedJson(root, changeDir, archiveRef, label, problems) {
  try {
    const target = resolveWithin(root, archiveRef, label);
    assertNoSymlinkComponents(changeDir, target, label);
    if (!fs.existsSync(target)) throw new Error('file is missing');
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (error) {
    problems.push(`${label} is unreadable: ${archiveRef} (${error.message})`);
    return null;
  }
}

// Verifies the frozen bundle only from harness/archive. It intentionally does
// not depend on the mutable source path or .git runtime receipts.
export function validateArchivedManifest(root, changeId) {
  const problems = [];
  try { assertSafeId(changeId, 'changeId'); } catch (error) { return [error.message]; }
  const changeDir = resolveChild(path.join(root, 'harness', 'archive'), changeId, 'changeId');
  const sourceManifestRef = archiveManifestRef(changeId);
  const sourceAttestationRef = archiveManifestAttestationRef(changeId);
  const manifestRef = archivePathFor(changeId, sourceManifestRef);
  const attestationRef = archivePathFor(changeId, sourceAttestationRef);
  const manifest = readArchivedJson(root, changeDir, manifestRef, 'archived manifest', problems);
  const attestation = readArchivedJson(root, changeDir, attestationRef, 'archived manifest attestation', problems);
  const state = readArchivedJson(root, changeDir, `harness/archive/${changeId}/state.json`, 'archived state', problems);
  if (!manifest || !attestation || !state) return [...new Set(problems)];

  rejectUnknown(manifest, 'archived manifest', MANIFEST_FIELDS, problems);
  if (manifest.manifestVersion !== 2) problems.push('archived manifestVersion must be 2');
  if (manifest.type !== 'archive-manifest') problems.push('archived manifest type must be archive-manifest');
  if (manifest.changeId !== changeId) problems.push(`archived manifest changeId must be ${changeId}`);
  try { assertSafeRunId(manifest.archiveRunId, 'archived archiveRunId'); } catch (error) { problems.push(error.message); }
  if (!Number.isFinite(Date.parse(manifest.createdAt))) problems.push('archived manifest createdAt must be an ISO timestamp');
  if (state.schemaVersion !== 6 || state.lifecycle !== 'archived') problems.push('archived state must be State v6 with lifecycle=archived');

  const expectedLineage = [];
  if (!isObject(manifest.inputDigests)) {
    problems.push('archived manifest inputDigests must be an object');
  } else {
    for (const [sourceRef, digest] of Object.entries(manifest.inputDigests).sort(([a], [b]) => a.localeCompare(b))) {
      let archiveRef;
      try { archiveRef = archivePathFor(changeId, sourceRef); } catch (error) { problems.push(error.message); continue; }
      expectedLineage.push({ path: sourceRef, archivePath: archiveRef, digest });
      if (!DIGEST.test(digest)) problems.push(`archived input digest is invalid: ${sourceRef}`);
      try {
        const target = resolveWithin(root, archiveRef, `archived input ${sourceRef}`);
        assertNoSymlinkComponents(changeDir, target, `archived input ${sourceRef}`);
        if (!fs.existsSync(target)) throw new Error('file is missing');
        if (sha256Artifact(root, archiveRef) !== digest) problems.push(`archived input digest is stale: ${archiveRef}`);
      } catch (error) {
        problems.push(`archived input is unreadable: ${archiveRef} (${error.message})`);
      }
    }
  }
  if (!Array.isArray(manifest.lineage)) {
    problems.push('archived lineage must be an array');
  } else {
    for (const entry of manifest.lineage) rejectUnknown(entry, 'archived lineage artifact', ARCHIVE_ARTIFACT_FIELDS, problems);
    if (!exact(manifest.lineage, expectedLineage)) problems.push('archived lineage must exactly bind every frozen input in canonical path order');
  }
  for (const key of ['verifyCompletionProof', 'validation', 'testCases', 'designProof']) {
    rejectUnknown(manifest[key], `archived ${key}`, ARCHIVE_ARTIFACT_FIELDS, problems);
    const expected = expectedLineage.find((entry) => entry.path === archiveManifestInputRefs(changeId)[key]);
    if (!expected || !exact(manifest[key], expected)) problems.push(`archived ${key} must exactly bind its frozen lineage artifact`);
  }

  rejectUnknown(manifest.testDesign, 'archived testDesign', TEST_DESIGN_FIELDS, problems);
  const designProof = readArchivedJson(root, changeDir, archivePathFor(changeId, archiveManifestInputRefs(changeId).designProof), 'archived DesignProof', problems);
  const testDesignProof = designProof?.stageProofs?.find((entry) => entry.kind === 'test-design');
  if (!isObject(manifest.testDesign)
    || manifest.testDesign.executionRunId !== testDesignProof?.executionRunId
    || manifest.testDesign.reviewRunId !== testDesignProof?.reviewRunId) {
    problems.push('archived testDesign must match the frozen compound DesignProof execute/review IDs');
  }

  rejectUnknown(attestation, 'archived manifest attestation', ATTESTATION_FIELDS, problems);
  if (attestation.receiptVersion !== 2) problems.push('archived manifest attestation receiptVersion must be 2');
  if (attestation.type !== 'archive-manifest-attestation' || attestation.provenance !== 'runtime-archive-facade') {
    problems.push('archived manifest attestation identity is invalid');
  }
  if (attestation.changeId !== changeId || attestation.archiveRunId !== manifest.archiveRunId) {
    problems.push('archived manifest attestation identity does not match the manifest');
  }
  const expectedManifestArtifact = {
    path: sourceManifestRef,
    archivePath: manifestRef,
    digest: sha256Artifact(root, manifestRef),
  };
  rejectUnknown(attestation.manifest, 'archived attestation manifest', ARCHIVE_ARTIFACT_FIELDS, problems);
  if (!exact(attestation.manifest, expectedManifestArtifact)) problems.push('archived attestation does not digest-bind the moved manifest');
  if (!exactDigestMap(attestation.inputDigests, manifest.inputDigests)) problems.push('archived attestation inputDigests do not match the manifest');
  if (!Number.isFinite(Date.parse(attestation.createdAt))) problems.push('archived attestation createdAt must be an ISO timestamp');
  return [...new Set(problems)];
}
