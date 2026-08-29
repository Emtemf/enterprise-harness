// Runtime-owned Archive manifest authority.  Archive Skills use the public
// facade; stage gates call this same validator so a worker cannot bypass the
// contract by emitting a hand-written StageResult.
import fs from 'node:fs';
import path from 'node:path';
import { v2ResultPath } from '../core/handoff-v2.mjs';
import { stageCompletionFor } from './stage-results.mjs';
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
  'verifyCompletionProof', 'validation', 'testCases', 'designProof', 'testDesign', 'createdAt',
]);
const ARTIFACT_FIELDS = new Set(['path', 'digest']);
const TEST_DESIGN_FIELDS = new Set(['executionRunId', 'reviewRunId', 'executionResult', 'reviewResult']);

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

function artifact(root, changeDir, ref, label, problems) {
  if (!isSafeRelativePath(ref)) {
    problems.push(`${label} must be a safe artifact reference`);
    return null;
  }
  try {
    const target = resolveWithin(root, ref, label);
    const changePrefix = `harness/changes/${path.basename(changeDir)}/`;
    // Completion chains legitimately point at immutable run results under the
    // git common directory. Change-owned artifacts get the narrower parent;
    // run artifacts remain root-contained and are already authenticated by
    // the canonical stage-completion resolver.
    assertNoSymlinkComponents(ref.startsWith(changePrefix) ? changeDir : root, target, label);
    if (!fs.existsSync(target)) throw new Error('file is missing');
    return { path: ref, digest: sha256Artifact(root, ref) };
  } catch (error) {
    problems.push(`${label} is unreadable: ${ref} (${error.message})`);
    return null;
  }
}

function verifyArtifactBinding(root, changeDir, actual, expected, label, problems) {
  rejectUnknown(actual, label, ARTIFACT_FIELDS, problems);
  if (!isObject(actual) || actual.path !== expected?.path || actual.digest !== expected?.digest) {
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

export function archiveManifestInputRefs(changeId) {
  assertSafeId(changeId, 'changeId');
  const base = `harness/changes/${changeId}`;
  return {
    validation: `${base}/validation.md`,
    verifyCompletionProof: `${base}/evidence/completion/verify.json`,
    testCases: `${base}/test-cases.md`,
    designProof: `${base}/evidence/completion/design.json`,
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
      const executionRef = path.relative(root, v2ResultPath(root, changeId, testDesignProof.executionRunId)).split(path.sep).join('/');
      const reviewRef = path.relative(root, v2ResultPath(root, changeId, testDesignProof.reviewRunId, 'check')).split(path.sep).join('/');
      const executionResult = artifact(root, changeDir, executionRef, 'test-design execute result', problems);
      const reviewResult = artifact(root, changeDir, reviewRef, 'test-design review result', problems);
      if (executionResult && reviewResult) {
        testDesign = {
          executionRunId: testDesignProof.executionRunId,
          reviewRunId: testDesignProof.reviewRunId,
          executionResult,
          reviewResult,
        };
      }
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
      manifestVersion: 1,
      type: 'archive-manifest',
      changeId,
      archiveRunId,
      inputDigests: { ...inputDigests },
      verifyCompletionProof: artifacts.verifyCompletionProof,
      validation: artifacts.validation,
      testCases: artifacts.testCases,
      designProof: artifacts.designProof,
      testDesign,
    },
    problems: [],
  };
}

export function createArchiveManifest(root, { changeId, archiveRunId, inputDigests }) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(archiveRunId, 'archiveRunId');
  const built = expectedManifest(root, changeId, archiveRunId, inputDigests);
  if (built.problems.length > 0) throw new Error(`EH-ARCHIVE-MANIFEST-001: ${built.problems.join('; ')}`);
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const ref = archiveManifestRef(changeId);
  const target = resolveWithin(root, ref, 'archive manifest');
  assertNoSymlinkComponents(changeDir, target, 'archive manifest');
  if (fs.existsSync(target)) throw new Error(`EH-ARCHIVE-MANIFEST-002: archive manifest already exists: ${ref}`);
  const manifest = { ...built.manifest, createdAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
  return { path: ref, digest: sha256Artifact(root, ref), manifest };
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
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(target, 'utf-8')); } catch (error) { return [`archive manifest is invalid JSON: ${error.message}`]; }
  if (!isObject(manifest)) return ['archive manifest must be an object'];
  rejectUnknown(manifest, 'archive manifest', MANIFEST_FIELDS, problems);
  if (manifest.manifestVersion !== 1) problems.push('manifestVersion must be 1');
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
    if (!exactDigestMap(manifest.inputDigests, built.manifest.inputDigests)) {
      problems.push('manifest inputDigests are not the current archive digest closure');
    }
  }
  return [...new Set(problems)];
}
