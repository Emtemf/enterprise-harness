import fs from 'node:fs';
import { atomicWriteJson, withFileLock } from '../lib/state-store.mjs';
import { assertSafeId, resolveWithin } from '../lib/safe-paths.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const IMPACT_KEYS = Object.freeze(['api', 'data', 'architecture', 'rule', 'security']);
const IMPACT_VALUES = new Set(['yes', 'no', 'unknown']);

export function classificationArtifactPath(changeId) {
  assertSafeId(changeId, 'changeId');
  return `harness/changes/${changeId}/classification.json`;
}

export function validateClassificationArtifact(changeId, classification) {
  const problems = [];
  if (!classification || typeof classification !== 'object' || Array.isArray(classification)) {
    return ['classification artifact must be an object'];
  }
  if (!classification.impact || typeof classification.impact !== 'object' || Array.isArray(classification.impact)) {
    problems.push('classification impact is required');
  } else {
    for (const key of IMPACT_KEYS) {
      if (!IMPACT_VALUES.has(classification.impact[key])) {
        problems.push(`classification impact.${key} is invalid`);
      }
    }
  }
  return problems;
}

export function writeClassificationArtifact(root, changeId, classification) {
  const problems = validateClassificationArtifact(changeId, classification);
  if (problems.length > 0) throw new Error(`EH-CLASSIFICATION-SCHEMA-001: ${problems.join('; ')}`);
  const relativePath = classificationArtifactPath(changeId);
  const absolutePath = resolveWithin(root, relativePath, 'classification artifact');
  atomicWriteJson(absolutePath, JSON.parse(JSON.stringify(classification)));
  return Object.freeze({
    path: relativePath,
    digest: sha256Artifact(root, relativePath),
  });
}

export function replaceClassificationArtifact(root, changeId, classification, commitReference) {
  if (typeof commitReference !== 'function') {
    throw new Error('EH-CLASSIFICATION-COMMIT-005: commitReference must be a function');
  }
  const relativePath = classificationArtifactPath(changeId);
  const absolutePath = resolveWithin(root, relativePath, 'classification artifact');
  return withFileLock(absolutePath, () => {
    const previous = fs.existsSync(absolutePath)
      ? JSON.parse(fs.readFileSync(absolutePath, 'utf-8'))
      : null;
    try {
      const reference = writeClassificationArtifact(root, changeId, classification);
      return commitReference(reference);
    } catch (error) {
      if (previous === null) fs.rmSync(absolutePath, { force: true });
      else atomicWriteJson(absolutePath, previous);
      throw error;
    }
  });
}

export function readClassificationArtifact(root, changeId, reference) {
  const expectedPath = classificationArtifactPath(changeId);
  if (!reference || typeof reference !== 'object' || reference.path !== expectedPath) {
    throw new Error(`EH-CLASSIFICATION-REFERENCE-003: classification reference must target ${expectedPath}`);
  }
  if (typeof reference.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(reference.digest)) {
    throw new Error('EH-CLASSIFICATION-REFERENCE-003: classification reference requires a sha256 digest');
  }
  const absolutePath = resolveWithin(root, expectedPath, 'classification artifact');
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`EH-CLASSIFICATION-READ-004: missing ${expectedPath}`);
  }
  const actualDigest = sha256Artifact(root, expectedPath);
  if (actualDigest !== reference.digest) {
    throw new Error(`EH-CLASSIFICATION-DIGEST-002: stale classification artifact ${expectedPath}`);
  }
  const classification = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  const problems = validateClassificationArtifact(changeId, classification);
  if (problems.length > 0) throw new Error(`EH-CLASSIFICATION-SCHEMA-001: ${problems.join('; ')}`);
  return Object.freeze(JSON.parse(JSON.stringify(classification)));
}
