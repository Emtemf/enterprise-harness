import fs from 'node:fs';
import path from 'node:path';
import { readDecisionEvents } from './decision-ledger.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  isSafeId,
  isSafeRelativePath,
  resolveWithin,
} from '../lib/safe-paths.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { atomicWriteJson, withFileLock } from '../lib/state-store.mjs';

const DIGEST = /^[a-f0-9]{64}$/u;
const DEBT_STATUSES = new Set([
  'fix-now',
  'enabling-task',
  'defer',
  'accepted-constraint',
  'not-debt',
]);
const PROJECT_STATUSES = new Set(['use-existing', 'proposal-required', 'conflict', 'deferred']);
const INSTRUCTION_SCOPES = new Set(['project', 'parent', 'organization']);
const DEBT_FIELDS = new Set([
  'assessmentVersion',
  'type',
  'changeId',
  'observations',
  'dispositions',
  'inputDigests',
  'updatedAt',
]);
const DEBT_OBSERVATION_FIELDS = new Set(['debtId', 'claim', 'evidenceRefs', 'relevance', 'impact']);
const DEBT_DISPOSITION_FIELDS = new Set(['debtId', 'status', 'decisionEventId', 'authorityRef']);
const PROJECT_FIELDS = new Set([
  'assessmentVersion',
  'type',
  'changeId',
  'files',
  'gaps',
  'conflicts',
  'status',
  'decisionEventId',
  'proposalRef',
  'inputDigests',
  'updatedAt',
]);
const INSTRUCTION_FILE_FIELDS = new Set(['path', 'digest', 'scope', 'ownership']);
const FINDING_FIELDS = new Set(['section', 'evidence']);
const FORBIDDEN_PROJECT_FIELDS = new Set(['content', 'patch', 'apply', 'writeTarget']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pathFailure(error) {
  if (String(error?.message || '').includes('EH-PATH-001')) return error;
  return new Error(`EH-PATH-001: ${error.message}`);
}

function assertAssessmentChangeId(changeId) {
  try {
    return assertSafeId(changeId, 'changeId');
  } catch (error) {
    throw pathFailure(error);
  }
}

export function debtAssessmentPath(changeId) {
  assertAssessmentChangeId(changeId);
  return `harness/changes/${changeId}/debt-assessment.json`;
}

export function projectContractAssessmentPath(changeId) {
  assertAssessmentChangeId(changeId);
  return `harness/changes/${changeId}/project-contract-assessment.json`;
}

function resolveAssessmentTarget(root, relativePath, label, { createParent = false } = {}) {
  try {
    let target = resolveWithin(root, relativePath, label);
    assertNoSymlinkComponents(root, target, label);
    if (createParent) fs.mkdirSync(path.dirname(target), { recursive: true });
    target = resolveWithin(root, relativePath, label);
    assertNoSymlinkComponents(root, target, label);
    return target;
  } catch (error) {
    throw pathFailure(error);
  }
}

function rejectUnknownProperties(value, label, allowed, problems) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) problems.push(`${label} has unknown property ${field}`);
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function validDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/u,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && Number(hourText) <= 23
    && Number(minuteText) <= 59
    && Number(secondText) <= 60
    && (offsetHourText === undefined || Number(offsetHourText) <= 23)
    && (offsetMinuteText === undefined || Number(offsetMinuteText) <= 59);
}

function sourcePath(reference) {
  if (typeof reference !== 'string' || !reference) return null;
  const locator = reference.match(/^(.*):([1-9]\d*)$/u);
  const artifactPath = locator ? locator[1] : reference;
  if (artifactPath.includes(':') || !isSafeRelativePath(artifactPath)) return null;
  return artifactPath;
}

function validateReferenceExists(root, reference, label, problems) {
  const relativePath = sourcePath(reference);
  if (!relativePath) {
    problems.push(`${label} must be a safe repository-relative artifact reference`);
    return;
  }
  try {
    const absolutePath = resolveWithin(root, relativePath, label);
    assertNoSymlinkComponents(root, absolutePath, label);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      problems.push(`${label} is missing: ${relativePath}`);
    }
  } catch (error) {
    problems.push(`${label} is unsafe: ${error.message}`);
  }
}

function validateDigestMapShape(value, field, problems) {
  if (!isObject(value)) {
    problems.push(`${field} must be an object`);
    return;
  }
  if (Object.keys(value).length === 0) problems.push(`${field} must not be empty`);
  for (const [reference, digest] of Object.entries(value)) {
    if (!isSafeRelativePath(reference) || reference.includes(':')) {
      problems.push(`${field} has unsafe artifact reference ${reference}`);
    }
    if (!DIGEST.test(digest)) problems.push(`${field}.${reference} must be a sha256 digest`);
  }
}

function requireDigestBinding(inputDigests, reference, label, problems) {
  const artifactPath = sourcePath(reference);
  if (artifactPath === null) return;
  if (!isObject(inputDigests)
      || !Object.prototype.hasOwnProperty.call(inputDigests, artifactPath)) {
    problems.push(`${label} requires inputDigests.${artifactPath}`);
  }
}

function staleDigestProblems(root, inputDigests, label) {
  const problems = [];
  if (!isObject(inputDigests)) return problems;
  for (const [reference, expectedDigest] of Object.entries(inputDigests)) {
    if (!isSafeRelativePath(reference) || reference.includes(':') || !DIGEST.test(expectedDigest)) continue;
    try {
      const absolutePath = resolveWithin(root, reference, `${label} input`);
      assertNoSymlinkComponents(root, absolutePath, `${label} input`);
      if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        problems.push(`${label} input is missing: ${reference}`);
      } else if (sha256Artifact(root, reference) !== expectedDigest) {
        problems.push(`${label} input digest is stale: ${reference}`);
      }
    } catch (error) {
      problems.push(`${label} input is unsafe: ${error.message}`);
    }
  }
  return problems;
}

function readEvents(root, changeId, problems, label) {
  try {
    return readDecisionEvents(root, changeId);
  } catch (error) {
    problems.push(`${label} cannot read decision ledger: ${error.message}`);
    return [];
  }
}

function debtValidation(root, changeId, assessment) {
  const schema = [];
  const disposition = [];
  const stale = [];
  if (!isObject(assessment)) {
    schema.push('debt assessment must be an object');
    return { schema, disposition, stale };
  }
  rejectUnknownProperties(assessment, 'debt assessment', DEBT_FIELDS, schema);
  if (assessment.assessmentVersion !== 1) schema.push('assessmentVersion must be 1');
  if (assessment.type !== 'debt-assessment') schema.push('type must be debt-assessment');
  if (!isSafeId(assessment.changeId)) schema.push('changeId must be a safe identifier');
  if (assessment.changeId !== changeId) schema.push(`changeId must be ${changeId}`);

  const observationIds = [];
  if (!Array.isArray(assessment.observations)) {
    schema.push('observations must be an array');
  } else {
    for (const [index, observation] of assessment.observations.entries()) {
      if (!isObject(observation)) {
        schema.push(`observations[${index}] must be an object`);
        continue;
      }
      rejectUnknownProperties(observation, `observations[${index}]`, DEBT_OBSERVATION_FIELDS, schema);
      if (!isSafeId(observation.debtId)) schema.push(`observations[${index}].debtId must be a safe identifier`);
      else observationIds.push(observation.debtId);
      for (const field of ['claim', 'relevance', 'impact']) {
        if (!nonEmptyString(observation[field])) schema.push(`observations[${index}].${field} is required`);
      }
      if (!Array.isArray(observation.evidenceRefs) || observation.evidenceRefs.length === 0) {
        schema.push(`observations[${index}].evidenceRefs must not be empty`);
      } else {
        for (const [evidenceIndex, reference] of observation.evidenceRefs.entries()) {
          validateReferenceExists(
            root,
            reference,
            `observations[${index}].evidenceRefs[${evidenceIndex}]`,
            schema,
          );
          requireDigestBinding(
            assessment.inputDigests,
            reference,
            `observations[${index}].evidenceRefs[${evidenceIndex}]`,
            schema,
          );
        }
      }
    }
  }

  const dispositionIds = [];
  if (!Array.isArray(assessment.dispositions)) {
    schema.push('dispositions must be an array');
  } else {
    for (const [index, item] of assessment.dispositions.entries()) {
      if (!isObject(item)) {
        schema.push(`dispositions[${index}] must be an object`);
        continue;
      }
      rejectUnknownProperties(item, `dispositions[${index}]`, DEBT_DISPOSITION_FIELDS, schema);
      if (!isSafeId(item.debtId)) schema.push(`dispositions[${index}].debtId must be a safe identifier`);
      else dispositionIds.push(item.debtId);
      if (!DEBT_STATUSES.has(item.status)) schema.push(`dispositions[${index}].status is invalid`);
      if (!isSafeId(item.decisionEventId)) {
        schema.push(`dispositions[${index}].decisionEventId must be a safe identifier`);
      }
      validateReferenceExists(root, item.authorityRef, `dispositions[${index}].authorityRef`, schema);
      requireDigestBinding(
        assessment.inputDigests,
        item.authorityRef,
        `dispositions[${index}].authorityRef`,
        schema,
      );
    }
  }

  validateDigestMapShape(assessment.inputDigests, 'inputDigests', schema);
  if (!validDateTime(assessment.updatedAt)) schema.push('updatedAt must be an RFC3339 date-time');
  stale.push(...staleDigestProblems(root, assessment.inputDigests, 'debt assessment'));

  const observed = [...observationIds].sort();
  const disposed = [...dispositionIds].sort();
  if (new Set(observationIds).size !== observationIds.length
      || new Set(dispositionIds).size !== dispositionIds.length
      || JSON.stringify(observed) !== JSON.stringify(disposed)) {
    disposition.push('every relevant debt observation requires exactly one disposition');
  }

  if (schema.length === 0 && disposition.length === 0 && assessment.dispositions.length > 0) {
    const events = readEvents(root, changeId, disposition, 'debt assessment');
    const byId = new Map(events.map((event) => [event.eventId, event]));
    for (const item of assessment.dispositions) {
      const event = byId.get(item.decisionEventId);
      if (!event
          || event.decisionType !== 'debt-disposition'
          || event.targetRef !== item.authorityRef
          || event.selectedOption !== item.status) {
        disposition.push(`debt ${item.debtId} requires a matching debt-disposition event`);
        continue;
      }
      stale.push(...staleDigestProblems(root, event.inputDigests, `decision event ${event.eventId}`));
    }
  }
  return { schema, disposition, stale };
}

export function validateDebtAssessment(root, changeId, assessment) {
  assertAssessmentChangeId(changeId);
  const result = debtValidation(root, changeId, assessment);
  return [...result.schema, ...result.disposition, ...result.stale];
}

function projectForbiddenFields(value, location = 'project contract assessment', problems = []) {
  if (!value || typeof value !== 'object') return problems;
  if (Array.isArray(value)) {
    value.forEach((item, index) => projectForbiddenFields(item, `${location}[${index}]`, problems));
    return problems;
  }
  for (const [field, child] of Object.entries(value)) {
    if (FORBIDDEN_PROJECT_FIELDS.has(field)) problems.push(`${location} contains forbidden field ${field}`);
    projectForbiddenFields(child, `${location}.${field}`, problems);
  }
  return problems;
}

function projectValidation(root, changeId, assessment) {
  const scope = projectForbiddenFields(assessment);
  const schema = [];
  const stale = [];
  if (!isObject(assessment)) {
    schema.push('project contract assessment must be an object');
    return { scope, schema, stale };
  }
  rejectUnknownProperties(assessment, 'project contract assessment', PROJECT_FIELDS, schema);
  if (assessment.assessmentVersion !== 1) schema.push('assessmentVersion must be 1');
  if (assessment.type !== 'project-contract-assessment') {
    schema.push('type must be project-contract-assessment');
  }
  if (!isSafeId(assessment.changeId)) schema.push('changeId must be a safe identifier');
  if (assessment.changeId !== changeId) schema.push(`changeId must be ${changeId}`);

  let hasProjectFile = false;
  if (!Array.isArray(assessment.files)) {
    schema.push('files must be an array');
  } else {
    const identities = new Set();
    for (const [index, file] of assessment.files.entries()) {
      if (!isObject(file)) {
        schema.push(`files[${index}] must be an object`);
        continue;
      }
      rejectUnknownProperties(file, `files[${index}]`, INSTRUCTION_FILE_FIELDS, schema);
      if (!isSafeRelativePath(file.path) || file.path.includes(':')) {
        scope.push(`files[${index}].path must be repository-relative`);
      } else {
        const identity = `${file.path}\u0000${file.scope}\u0000${file.ownership}`;
        if (identities.has(identity)) schema.push(`files[${index}] duplicates an instruction file`);
        identities.add(identity);
        if (file.scope === 'project' && file.ownership === 'project') hasProjectFile = true;
        try {
          const absolutePath = resolveWithin(root, file.path, `files[${index}].path`);
          assertNoSymlinkComponents(root, absolutePath, `files[${index}].path`);
          if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
            stale.push(`instruction file is missing: ${file.path}`);
          } else if (DIGEST.test(file.digest) && sha256Artifact(root, file.path) !== file.digest) {
            stale.push(`instruction file digest is stale: ${file.path}`);
          }
        } catch (error) {
          scope.push(`files[${index}].path is unsafe: ${error.message}`);
        }
      }
      if (!DIGEST.test(file.digest)) schema.push(`files[${index}].digest must be a sha256 digest`);
      requireDigestBinding(assessment.inputDigests, file.path, `files[${index}].path`, schema);
      if (!INSTRUCTION_SCOPES.has(file.scope)) schema.push(`files[${index}].scope is invalid`);
      if (!INSTRUCTION_SCOPES.has(file.ownership)) schema.push(`files[${index}].ownership is invalid`);
    }
  }

  for (const field of ['gaps', 'conflicts']) {
    if (!Array.isArray(assessment[field])) {
      schema.push(`${field} must be an array`);
      continue;
    }
    const findings = new Set();
    for (const [index, finding] of assessment[field].entries()) {
      if (!isObject(finding)) {
        schema.push(`${field}[${index}] must be an object`);
        continue;
      }
      rejectUnknownProperties(finding, `${field}[${index}]`, FINDING_FIELDS, schema);
      if (!nonEmptyString(finding.section)) schema.push(`${field}[${index}].section is required`);
      if (!nonEmptyString(finding.evidence)) schema.push(`${field}[${index}].evidence is required`);
      const identity = JSON.stringify(finding);
      if (findings.has(identity)) schema.push(`${field}[${index}] duplicates a finding`);
      findings.add(identity);
    }
  }

  if (!PROJECT_STATUSES.has(assessment.status)) schema.push('status is invalid');
  if (assessment.decisionEventId !== null && !isSafeId(assessment.decisionEventId)) {
    schema.push('decisionEventId must be null or a safe identifier');
  }
  if (assessment.proposalRef !== null) {
    const proposalPath = sourcePath(assessment.proposalRef);
    if (proposalPath === null) {
      scope.push('proposalRef must be null or a safe repository-relative artifact reference');
    } else {
      try {
        const absolutePath = resolveWithin(root, proposalPath, 'proposalRef');
        assertNoSymlinkComponents(root, absolutePath, 'proposalRef');
        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
          stale.push(`proposalRef is missing: ${proposalPath}`);
        }
      } catch (error) {
        scope.push(`proposalRef is unsafe: ${error.message}`);
      }
      if (!isObject(assessment.inputDigests)
          || !Object.prototype.hasOwnProperty.call(assessment.inputDigests, proposalPath)) {
        schema.push(`inputDigests must bind proposalRef ${proposalPath}`);
      }
    }
  }
  validateDigestMapShape(assessment.inputDigests, 'inputDigests', schema);
  if (!validDateTime(assessment.updatedAt)) schema.push('updatedAt must be an RFC3339 date-time');
  stale.push(...staleDigestProblems(root, assessment.inputDigests, 'project contract assessment'));

  if (assessment.status === 'use-existing') {
    if (!hasProjectFile) schema.push('use-existing requires an existing project instruction file');
    if (assessment.gaps?.length > 0 || assessment.conflicts?.length > 0) {
      schema.push('use-existing requires no gaps or conflicts');
    }
  }
  if (assessment.status === 'proposal-required') {
    if (hasProjectFile && assessment.gaps?.length === 0) {
      schema.push('proposal-required requires a gap or no project instruction file');
    }
    if (assessment.proposalRef !== null) schema.push('proposal-required requires proposalRef null');
  }
  if (assessment.status === 'conflict' && assessment.conflicts?.length === 0) {
    schema.push('conflict requires at least one conflict');
  }

  const decisionRequired = assessment.status !== 'use-existing' || assessment.decisionEventId !== null;
  if (schema.length === 0 && scope.length === 0 && decisionRequired) {
    const events = readEvents(root, changeId, schema, 'project contract assessment');
    const event = events.find((item) => item.eventId === assessment.decisionEventId);
    if (!event
        || event.decisionType !== 'project-contract-disposition'
        || event.targetRef !== projectContractAssessmentPath(changeId)
        || event.selectedOption !== assessment.status) {
      schema.push(`${assessment.status} requires a matching project-contract-disposition event`);
    } else {
      if (['conflict', 'deferred'].includes(assessment.status) && event.actor.type !== 'user') {
        schema.push(`${assessment.status} requires a user decision event`);
      }
      stale.push(...staleDigestProblems(root, event.inputDigests, `decision event ${event.eventId}`));
    }
  }
  return { scope, schema, stale };
}

export function validateProjectContractAssessment(root, changeId, assessment) {
  assertAssessmentChangeId(changeId);
  const result = projectValidation(root, changeId, assessment);
  return [...result.scope, ...result.schema, ...result.stale];
}

function throwDebtProblems(result) {
  if (result.schema.length > 0) throw new Error(`EH-DEBT-SCHEMA-120: ${result.schema.join('; ')}`);
  if (result.disposition.length > 0) {
    throw new Error(`EH-DEBT-DISPOSITION-121: ${result.disposition.join('; ')}`);
  }
  if (result.stale.length > 0) throw new Error(`EH-DEBT-STALE-122: ${result.stale.join('; ')}`);
}

function throwProjectProblems(result) {
  if (result.scope.length > 0) {
    throw new Error(`EH-PROJECT-CONTRACT-SCOPE-125: ${result.scope.join('; ')}`);
  }
  if (result.schema.length > 0) {
    throw new Error(`EH-PROJECT-CONTRACT-SCHEMA-123: ${result.schema.join('; ')}`);
  }
  if (result.stale.length > 0) {
    throw new Error(`EH-PROJECT-CONTRACT-STALE-124: ${result.stale.join('; ')}`);
  }
}

function writeAssessment(root, changeId, relativePath, assessment, validateAndThrow, label) {
  const absolutePath = resolveAssessmentTarget(root, relativePath, label, { createParent: true });
  validateAndThrow();
  return withFileLock(absolutePath, () => {
    resolveAssessmentTarget(root, relativePath, label);
    validateAndThrow();
    atomicWriteJson(absolutePath, clone(assessment));
    resolveAssessmentTarget(root, relativePath, label);
    return Object.freeze({ path: relativePath, digest: sha256Artifact(root, relativePath) });
  });
}

export function writeDebtAssessment(root, changeId, assessment) {
  const relativePath = debtAssessmentPath(changeId);
  return writeAssessment(
    root,
    changeId,
    relativePath,
    assessment,
    () => throwDebtProblems(debtValidation(root, changeId, assessment)),
    'debt assessment',
  );
}

export function writeProjectContractAssessment(root, changeId, assessment) {
  const relativePath = projectContractAssessmentPath(changeId);
  return writeAssessment(
    root,
    changeId,
    relativePath,
    assessment,
    () => throwProjectProblems(projectValidation(root, changeId, assessment)),
    'project contract assessment',
  );
}

function readAssessment(root, changeId, relativePath, label, errorCode, validateAndThrow) {
  const absolutePath = resolveAssessmentTarget(root, relativePath, label);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`${errorCode}: missing ${relativePath}`);
  }
  let assessment;
  try {
    assessment = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  } catch (error) {
    throw new Error(`${errorCode}: invalid JSON at ${relativePath}: ${error.message}`);
  }
  validateAndThrow(assessment);
  return Object.freeze(clone(assessment));
}

export function readDebtAssessment(root, changeId) {
  const relativePath = debtAssessmentPath(changeId);
  return readAssessment(
    root,
    changeId,
    relativePath,
    'debt assessment',
    'EH-DEBT-SCHEMA-120',
    (assessment) => throwDebtProblems(debtValidation(root, changeId, assessment)),
  );
}

export function readProjectContractAssessment(root, changeId) {
  const relativePath = projectContractAssessmentPath(changeId);
  return readAssessment(
    root,
    changeId,
    relativePath,
    'project contract assessment',
    'EH-PROJECT-CONTRACT-SCHEMA-123',
    (assessment) => throwProjectProblems(projectValidation(root, changeId, assessment)),
  );
}
