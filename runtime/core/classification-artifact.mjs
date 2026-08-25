import fs from 'node:fs';
import { atomicWriteJson, withFileLock } from '../lib/state-store.mjs';
import { assertNoSymlinkComponents, assertSafeId, isSafeRelativePath, resolveWithin } from '../lib/safe-paths.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { readDecisionEvents, readClarifyDecisionSnapshot, clarifyDecisionSnapshotPath } from './decision-ledger.mjs';
import {
  debtAssessmentPath,
  projectContractAssessmentPath,
  readDebtAssessment,
  readProjectContractAssessment,
} from './clarify-assessments.mjs';
import { readClarifyResearchEvidence } from '../lib/clarify-research-evidence.mjs';

const SCORE_KEYS = Object.freeze(['functionalSize', 'uncertainty', 'changeRisk', 'verificationDifficulty']);
const IMPACT_KEYS = Object.freeze(['api', 'data', 'architecture', 'rule', 'security']);
const IMPACT_VALUES = new Set(['yes', 'no', 'unknown']);
const HARD_FLAGS = new Set(['public-api-break', 'security-boundary', 'cross-service-transaction', 'irreversible-data-migration', 'unknown-compliance-obligation']);
const L2_FLAGS = new Set(['public-api-break', 'security-boundary', 'cross-service-transaction']);
const L3_FLAGS = new Set(['irreversible-data-migration', 'unknown-compliance-obligation']);
const CLASSIFICATION_FIELDS = new Set(['classificationVersion', 'type', 'changeId', 'scores', 'total', 'tier', 'hardFlags', 'impact', 'inputDigests', 'decisionEventId']);
const SCORE_FIELDS = new Set(['value', 'evidenceRefs', 'reason']);
const DIGEST = /^[a-f0-9]{64}$/u;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function artifactPathFromReference(reference) {
  if (typeof reference !== 'string' || !reference.trim()) return null;
  const locator = reference.match(/^(.*):([1-9]\d*)$/u);
  const artifactPath = locator ? locator[1] : reference;
  return artifactPath.includes(':') || !isSafeRelativePath(artifactPath) ? null : artifactPath;
}

function sameObject(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function addUnknownProperties(value, label, allowed, problems) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) problems.push(`${label} has unknown property ${key}`);
}

function errorFor(problems) {
  if (problems.some((problem) => /route decision|decision ledger/u.test(problem))) {
    return new Error(`EH-CLASSIFICATION-ROUTE-128: ${problems.join('; ')}`);
  }
  if (problems.some((problem) => /stale|missing|unreadable/u.test(problem))) {
    return new Error(`EH-CLASSIFICATION-STALE-129: ${problems.join('; ')}`);
  }
  return new Error(`EH-CLASSIFICATION-SCHEMA-001: ${problems.join('; ')}`);
}

export function deriveClassificationTier(values, hardFlags = []) {
  if (!isObject(values) || Object.keys(values).length !== SCORE_KEYS.length
      || SCORE_KEYS.some((key) => !Number.isInteger(values[key]) || values[key] < 0 || values[key] > 3)) {
    throw new Error('EH-CLASSIFICATION-SCHEMA-001: scores must contain exact integer values from 0 to 3');
  }
  if (!Array.isArray(hardFlags) || hardFlags.some((flag) => !HARD_FLAGS.has(flag))
      || new Set(hardFlags).size !== hardFlags.length) {
    throw new Error('EH-CLASSIFICATION-SCHEMA-001: hardFlags contains an unknown or duplicate flag');
  }
  const total = SCORE_KEYS.reduce((sum, key) => sum + values[key], 0);
  let tier = total <= 2 ? 'L0' : total <= 5 ? 'L1' : total <= 8 ? 'L2' : 'L3';
  if (hardFlags.some((flag) => L2_FLAGS.has(flag)) && ['L0', 'L1'].includes(tier)) tier = 'L2';
  if (hardFlags.some((flag) => L3_FLAGS.has(flag))) tier = 'L3';
  return Object.freeze({ total, tier });
}

export function classificationArtifactPath(changeId) {
  assertSafeId(changeId, 'changeId');
  return `harness/changes/${changeId}/classification.json`;
}

function validateFreshInputs(root, classification, problems) {
  if (!root) return;
  for (const [reference, expectedDigest] of Object.entries(classification.inputDigests || {})) {
    try {
      const absolutePath = resolveWithin(root, reference, 'classification input');
      assertNoSymlinkComponents(root, absolutePath, 'classification input');
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) problems.push(`classification input is missing: ${reference}`);
      else if (DIGEST.test(expectedDigest) && sha256Artifact(root, reference) !== expectedDigest) problems.push(`classification input digest is stale: ${reference}`);
    } catch (error) {
      problems.push(`classification input is unreadable: ${reference} (${error.message})`);
    }
  }
  for (const [scoreKey, score] of Object.entries(classification.scores || {})) {
    for (const reference of score?.evidenceRefs || []) {
      const artifactPath = artifactPathFromReference(reference);
      if (!artifactPath) continue;
      if (!Object.hasOwn(classification.inputDigests || {}, artifactPath)) {
        problems.push(`scores.${scoreKey}.evidenceRefs requires inputDigests.${artifactPath}`);
        continue;
      }
      try {
        const absolutePath = resolveWithin(root, artifactPath, 'classification evidence');
        assertNoSymlinkComponents(root, absolutePath, 'classification evidence');
        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) problems.push(`classification evidence is missing: ${artifactPath}`);
      } catch (error) {
        problems.push(`classification evidence is unreadable: ${artifactPath} (${error.message})`);
      }
    }
  }
}

function validateRouteEvent(root, changeId, classification, problems) {
  if (!root) {
    problems.push('route decision validation requires the repository root');
    return;
  }
  let events;
  try {
    events = readDecisionEvents(root, changeId);
  } catch (error) {
    problems.push(`decision ledger is unreadable: ${error.message}`);
    return;
  }
  const event = events.find(({ eventId }) => eventId === classification.decisionEventId);
  if (!event || event.decisionType !== 'classification-route'
      || event.targetRef !== classificationArtifactPath(changeId)
      || event.selectedOption !== classification.tier
      || !event.options.includes(classification.tier)
      || !sameObject(event.inputDigests, classification.inputDigests)) {
    problems.push('matching classification-route decision event is required and selectedOption must equal tier');
  }
}

function validateAuthoritativeInputs(root, changeId, classification, problems) {
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const mandatoryRefs = [
    requirementsRef,
    clarifyDecisionSnapshotPath(changeId),
    debtAssessmentPath(changeId),
    projectContractAssessmentPath(changeId),
  ];
  let requirements = '';
  try {
    const absolute = resolveWithin(root, requirementsRef, 'classification requirements');
    assertNoSymlinkComponents(root, absolute, 'classification requirements');
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error('requirements.md is missing');
    requirements = fs.readFileSync(absolute, 'utf-8');
  } catch (error) {
    problems.push(`authoritative requirements input is invalid: ${error.message}`);
  }
  try {
    readClarifyDecisionSnapshot(root, changeId);
  } catch (error) {
    problems.push(`authoritative decision snapshot is invalid: ${error.message}`);
  }
  try {
    readDebtAssessment(root, changeId);
  } catch (error) {
    problems.push(`authoritative debt assessment is invalid: ${error.message}`);
  }
  try {
    readProjectContractAssessment(root, changeId);
  } catch (error) {
    problems.push(`authoritative project-contract assessment is invalid: ${error.message}`);
  }
  const research = readClarifyResearchEvidence(root, changeId, requirementsRef, requirements);
  if (!research.fresh) problems.push(...research.problems.map((problem) => `authoritative research input is invalid: ${problem}`));
  const expectedRefs = new Set([...mandatoryRefs, ...research.refs]);
  for (const reference of expectedRefs) {
    if (!Object.hasOwn(classification.inputDigests || {}, reference)) {
      problems.push(`authoritative classification input is missing: ${reference} is required`);
    }
  }
  for (const reference of Object.keys(classification.inputDigests || {})) {
    if (!expectedRefs.has(reference)) problems.push(`classification input is not a same-change canonical ref: ${reference}`);
  }
  for (const [scoreKey, score] of Object.entries(classification.scores || {})) {
    for (const reference of score?.evidenceRefs || []) {
      const artifactPath = artifactPathFromReference(reference);
      if (artifactPath && !expectedRefs.has(artifactPath)) {
        problems.push(`scores.${scoreKey}.evidenceRefs is not a same-change canonical ref: ${artifactPath}`);
      }
    }
  }
}

export function validateClassificationArtifact(root, changeId, classification) {
  const problems = [];
  try {
    assertSafeId(changeId, 'changeId');
  } catch (error) {
    return [`EH-PATH-001: ${error.message}`];
  }
  if (!isObject(classification)) return ['classification artifact must be an object'];
  addUnknownProperties(classification, 'classification artifact', CLASSIFICATION_FIELDS, problems);
  if (classification.classificationVersion !== 2) problems.push('classificationVersion must be 2');
  if (classification.type !== 'clarify-classification') problems.push('type must be clarify-classification');
  if (classification.changeId !== changeId) problems.push(`changeId must be ${changeId}`);

  const scoreValues = {};
  if (!isObject(classification.scores)) problems.push('scores must be an object');
  else {
    addUnknownProperties(classification.scores, 'scores', new Set(SCORE_KEYS), problems);
    for (const key of SCORE_KEYS) {
      const score = classification.scores[key];
      if (!isObject(score)) {
        problems.push(`scores.${key} must be an object`);
        continue;
      }
      addUnknownProperties(score, `scores.${key}`, SCORE_FIELDS, problems);
      if (!Number.isInteger(score.value) || score.value < 0 || score.value > 3) problems.push(`scores.${key}.value must be an integer from 0 to 3`);
      else scoreValues[key] = score.value;
      if (!Array.isArray(score.evidenceRefs) || score.evidenceRefs.length === 0) problems.push(`scores.${key}.evidenceRefs must not be empty`);
      else if (score.evidenceRefs.some((reference) => !artifactPathFromReference(reference))) problems.push(`scores.${key}.evidenceRefs must contain safe artifact references`);
      if (typeof score.reason !== 'string' || !score.reason.trim()) problems.push(`scores.${key}.reason is required`);
    }
  }
  if (!Array.isArray(classification.hardFlags) || classification.hardFlags.some((flag) => !HARD_FLAGS.has(flag))
      || new Set(classification.hardFlags).size !== classification.hardFlags.length) problems.push('hardFlags contains an unknown or duplicate flag');
  if (Object.keys(scoreValues).length === SCORE_KEYS.length && Array.isArray(classification.hardFlags)
      && classification.hardFlags.every((flag) => HARD_FLAGS.has(flag))) {
    const derived = deriveClassificationTier(scoreValues, [...new Set(classification.hardFlags)]);
    if (classification.total !== derived.total) problems.push(`total must equal ${derived.total}`);
    if (classification.tier !== derived.tier) problems.push(`tier must equal ${derived.tier}`);
  }

  if (!isObject(classification.impact)) problems.push('classification impact is required');
  else {
    addUnknownProperties(classification.impact, 'classification impact', new Set(IMPACT_KEYS), problems);
    for (const key of IMPACT_KEYS) if (!IMPACT_VALUES.has(classification.impact[key])) problems.push(`classification impact.${key} is invalid`);
  }
  if (!isObject(classification.inputDigests) || Object.keys(classification.inputDigests).length === 0) problems.push('inputDigests must be a non-empty object');
  else {
    for (const [reference, digest] of Object.entries(classification.inputDigests)) {
      if (!isSafeRelativePath(reference) || reference.includes(':')) problems.push(`inputDigests has unsafe artifact reference ${reference}`);
      if (!DIGEST.test(String(digest || ''))) problems.push(`inputDigests.${reference} must be a sha256 digest`);
    }
  }
  try {
    assertSafeId(classification.decisionEventId, 'decisionEventId');
  } catch {
    problems.push('decisionEventId must be a safe identifier');
  }
  validateFreshInputs(root, classification, problems);
  validateAuthoritativeInputs(root, changeId, classification, problems);
  validateRouteEvent(root, changeId, classification, problems);
  return problems;
}

export function classifyClarify(root, changeId, input) {
  if (!isObject(input)) throw new Error('EH-CLASSIFICATION-SCHEMA-001: classification input is required');
  const scoreValues = Object.fromEntries(SCORE_KEYS.map((key) => [key, input.scores?.[key]?.value]));
  const derived = deriveClassificationTier(scoreValues, input.hardFlags || []);
  const classification = {
    classificationVersion: 2,
    type: 'clarify-classification',
    changeId,
    scores: clone(input.scores),
    total: derived.total,
    tier: derived.tier,
    hardFlags: [...(input.hardFlags || [])],
    impact: clone(input.impact),
    inputDigests: clone(input.inputDigests),
    decisionEventId: input.decisionEventId,
  };
  const problems = validateClassificationArtifact(root, changeId, classification);
  if (problems.length > 0) throw errorFor(problems);
  return Object.freeze(clone(classification));
}

export function writeClassificationArtifact(root, changeId, classification) {
  const problems = validateClassificationArtifact(root, changeId, classification);
  if (problems.length > 0) throw errorFor(problems);
  const relativePath = classificationArtifactPath(changeId);
  const absolutePath = resolveWithin(root, relativePath, 'classification artifact');
  atomicWriteJson(absolutePath, clone(classification));
  return Object.freeze({ path: relativePath, digest: sha256Artifact(root, relativePath) });
}

export function replaceClassificationArtifact(root, changeId, classification, commitReference) {
  if (typeof commitReference !== 'function') throw new Error('EH-CLASSIFICATION-COMMIT-005: commitReference must be a function');
  const relativePath = classificationArtifactPath(changeId);
  const absolutePath = resolveWithin(root, relativePath, 'classification artifact');
  return withFileLock(absolutePath, () => {
    const previous = fs.existsSync(absolutePath) ? JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) : null;
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
  if (!isObject(reference) || reference.path !== expectedPath) throw new Error(`EH-CLASSIFICATION-REFERENCE-003: classification reference must target ${expectedPath}`);
  if (typeof reference.digest !== 'string' || !DIGEST.test(reference.digest)) throw new Error('EH-CLASSIFICATION-REFERENCE-003: classification reference requires a sha256 digest');
  const absolutePath = resolveWithin(root, expectedPath, 'classification artifact');
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-CLASSIFICATION-READ-004: missing ${expectedPath}`);
  if (sha256Artifact(root, expectedPath) !== reference.digest) throw new Error(`EH-CLASSIFICATION-DIGEST-002: stale classification artifact ${expectedPath}`);
  const classification = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  const problems = validateClassificationArtifact(root, changeId, classification);
  if (problems.length > 0) throw errorFor(problems);
  return Object.freeze(clone(classification));
}
