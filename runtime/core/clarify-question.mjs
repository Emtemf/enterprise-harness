import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appendDecisionEvent, readDecisionEvents } from './decision-ledger.mjs';
import { statePathFor, validateV6State } from './change-state.mjs';
import { activeChangeId, gitCommonDir } from '../lib/agent-evidence.mjs';
import { assertClarifyQuestionFactGate } from '../lib/clarify-question-gate.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  isSafeId,
  isSafeRelativePath,
  resolveWithin,
} from '../lib/safe-paths.mjs';
import { atomicWriteJson, withFileLock } from '../lib/state-store.mjs';

const DIGEST = /^[a-f0-9]{64}$/u;
const DIMENSIONS = new Set([
  'Goal', 'Scope', 'Constraints', 'Acceptance', 'Context', 'TechnicalDebt', 'ProjectContract',
]);
const INTERACTIVE_DECISION_TYPES = new Set([
  'clarify-answer', 'debt-disposition', 'project-contract-disposition', 'scope-confirmation',
]);
const CANDIDATE_FIELDS = new Set([
  'questionVersion', 'type', 'changeId', 'questionId', 'componentId', 'dimension',
  'decisionNeeded', 'whyUserOnly', 'decisionType', 'targetRef', 'header', 'question', 'options', 'recommendedOption',
  'recommendationReason', 'evidenceRefs', 'inputDigests', 'blocking', 'createdAt',
]);
const OPTION_FIELDS = new Set(['id', 'label', 'description']);
const PENDING_FIELDS = new Set([
  'pendingVersion', 'changeId', 'questionId', 'candidateRef', 'candidateDigest',
  'status', 'preparedAt', 'eventId', 'resolvedAt',
]);
const PUBLIC_RATIONALE = 'Selected by the user through AskUserQuestion.';

function questionError(code, message) {
  return new Error(`${code}: ${message}`);
}

function pathFailure(error) {
  if (String(error?.message || '').includes('EH-PATH-001')) return error;
  return new Error(`EH-PATH-001: ${error.message}`);
}

function assertQuestionSafeId(value, label) {
  try {
    return assertSafeId(value, label);
  } catch (error) {
    throw pathFailure(error);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function artifactPathFromReference(value) {
  if (!isNonEmptyString(value)) return null;
  let artifactPath = value;
  const locator = value.match(/^(.*):([1-9]\d*)$/u);
  if (locator) artifactPath = locator[1];
  if (artifactPath.includes(':') || !isSafeRelativePath(artifactPath)) return null;
  return artifactPath;
}

function isSchemaDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/u,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
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

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalizeJson(value[key])]),
    );
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(normalizeJson(left)) === JSON.stringify(normalizeJson(right));
}

export function validateQuestionCandidate(candidate) {
  const problems = [];
  if (!isObject(candidate)) return ['candidate must be an object'];
  for (const key of Object.keys(candidate)) {
    if (!CANDIDATE_FIELDS.has(key)) problems.push(`candidate has unknown property ${key}`);
  }
  if (candidate.questionVersion !== 1) problems.push('questionVersion must be 1');
  if (candidate.type !== 'clarify-question-candidate') problems.push('type must be clarify-question-candidate');
  for (const field of ['changeId', 'questionId', 'componentId', 'recommendedOption']) {
    if (!isSafeId(candidate[field])) problems.push(`${field} must be a safe identifier`);
  }
  if (!DIMENSIONS.has(candidate.dimension)) problems.push('dimension is invalid');
  if (!INTERACTIVE_DECISION_TYPES.has(candidate.decisionType)) problems.push('decisionType is invalid for an interactive question');
  const targetPath = artifactPathFromReference(candidate.targetRef);
  if (targetPath === null) problems.push('targetRef must be a safe artifact reference');
  for (const field of ['decisionNeeded', 'whyUserOnly', 'header', 'question', 'recommendationReason']) {
    if (!isNonEmptyString(candidate[field])) problems.push(`${field} must be a non-empty string`);
  }
  if (isNonEmptyString(candidate.header) && [...candidate.header].length > 12) problems.push('header must be at most 12 characters');
  if (!Array.isArray(candidate.options) || candidate.options.length < 2 || candidate.options.length > 4) {
    problems.push('options must contain between 2 and 4 entries');
  } else {
    for (const [index, option] of candidate.options.entries()) {
      if (!isObject(option)) {
        problems.push(`options[${index}] must be an object`);
        continue;
      }
      for (const key of Object.keys(option)) {
        if (!OPTION_FIELDS.has(key)) problems.push(`options[${index}] has unknown property ${key}`);
      }
      if (!isSafeId(option.id)) problems.push(`options[${index}].id must be a safe identifier`);
      if (!isNonEmptyString(option.label)) problems.push(`options[${index}].label must be a non-empty string`);
      if (/\brecommended\b/iu.test(option.label || '') || /^(?:other|其它|其他)$/iu.test(String(option.label || '').trim())) {
        problems.push(`options[${index}].label must not contain the host recommendation marker or reserved Other label`);
      }
      if (!isNonEmptyString(option.description)) problems.push(`options[${index}].description must be a non-empty string`);
    }
    const optionIds = candidate.options.map(({ id }) => id);
    const optionLabels = candidate.options.map(({ label }) => label);
    if (new Set(optionIds).size !== optionIds.length) problems.push('option IDs must be unique');
    if (new Set(optionLabels).size !== optionLabels.length) problems.push('option labels must be unique');
    if (!optionIds.includes(candidate.recommendedOption)) problems.push('recommendedOption must identify an option');
  }
  if (!Array.isArray(candidate.evidenceRefs)
      || candidate.evidenceRefs.length === 0
      || candidate.evidenceRefs.some((ref) => artifactPathFromReference(ref) === null)) {
    problems.push('evidenceRefs must contain safe non-empty artifact references');
  }
  if (!isObject(candidate.inputDigests) || Object.keys(candidate.inputDigests).length === 0) {
    problems.push('inputDigests must be a non-empty object');
  } else {
    for (const [ref, digest] of Object.entries(candidate.inputDigests)) {
      if (!isSafeRelativePath(ref)) problems.push(`inputDigests has unsafe artifact reference ${ref}`);
      if (!DIGEST.test(String(digest || ''))) problems.push(`inputDigests.${ref} must be a sha256 digest`);
    }
  }
  for (const ref of candidate.evidenceRefs || []) {
    const artifactPath = artifactPathFromReference(ref);
    if (artifactPath && !Object.hasOwn(candidate.inputDigests || {}, artifactPath)) {
      problems.push(`evidenceRefs requires inputDigests.${artifactPath}`);
    }
  }
  if (targetPath && !Object.hasOwn(candidate.inputDigests || {}, targetPath)) {
    problems.push(`targetRef requires inputDigests.${targetPath}`);
  }
  if (candidate.blocking !== true) problems.push('blocking must be true');
  if (!isSchemaDateTime(candidate.createdAt)) problems.push('createdAt must be an RFC3339 date-time');
  return problems;
}

function assertEvidenceReferencesContained(root, candidate) {
  for (const ref of candidate.evidenceRefs) {
    resolveRepoTarget(root, artifactPathFromReference(ref), 'candidate evidence reference');
  }
}

function resolveRepoTarget(root, relativePath, label) {
  try {
    const target = resolveWithin(root, relativePath, label);
    assertNoSymlinkComponents(root, target, label);
    return target;
  } catch (error) {
    throw pathFailure(error);
  }
}

function assertFreshInputs(root, candidate) {
  for (const [ref, expectedDigest] of Object.entries(candidate.inputDigests)) {
    const target = resolveRepoTarget(root, ref, 'candidate input');
    if (!fs.existsSync(target)) {
      throw questionError('EH-QUESTION-STALE-107', `candidate input is missing: ${ref}`);
    }
    if (sha256Bytes(fs.readFileSync(target)) !== expectedDigest) {
      throw questionError('EH-QUESTION-STALE-107', `candidate input digest is stale: ${ref}`);
    }
  }
}

function loadCandidate(root, expectedChangeId, candidateRef) {
  if (!isSafeRelativePath(candidateRef)) {
    throw pathFailure(new Error('candidateRef must be a safe relative path'));
  }
  const target = resolveRepoTarget(root, candidateRef, 'candidateRef');
  if (!fs.existsSync(target)) {
    throw questionError('EH-QUESTION-CANDIDATE-106', `candidate does not exist: ${candidateRef}`);
  }
  const bytes = fs.readFileSync(target);
  let candidate;
  try {
    candidate = JSON.parse(bytes.toString('utf-8'));
  } catch (error) {
    throw questionError('EH-QUESTION-CANDIDATE-106', `candidate has invalid JSON: ${error.message}`);
  }
  const problems = validateQuestionCandidate(candidate);
  if (problems.length > 0) throw questionError('EH-QUESTION-CANDIDATE-106', problems.join('; '));
  if (candidate.changeId !== expectedChangeId) {
    throw questionError('EH-QUESTION-CANDIDATE-106', `candidate changeId must be ${expectedChangeId}`);
  }
  const canonicalRef = questionCandidatePath(expectedChangeId, candidate.questionId);
  if (candidateRef !== canonicalRef) {
    throw questionError('EH-QUESTION-CANDIDATE-106', `candidateRef must be the canonical path ${canonicalRef}`);
  }
  assertEvidenceReferencesContained(root, candidate);
  assertFreshInputs(root, candidate);
  return { candidate, candidateDigest: sha256Bytes(bytes) };
}

function assertActiveClarifyChange(root, changeId) {
  const active = activeChangeId(root);
  if (active !== changeId) {
    throw questionError('EH-QUESTION-ACTIVE-108', `active change must be ${changeId}`);
  }
  let statePath;
  try {
    statePath = statePathFor(root, changeId);
    assertNoSymlinkComponents(root, statePath, 'change state');
  } catch (error) {
    throw pathFailure(error);
  }
  if (!fs.existsSync(statePath)) {
    throw questionError('EH-QUESTION-ACTIVE-108', `missing v6 state for ${changeId}`);
  }
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch (error) {
    throw questionError('EH-QUESTION-ACTIVE-108', `invalid state JSON: ${error.message}`);
  }
  const problems = validateV6State(state, changeId);
  if (problems.length > 0 || state.lifecycle !== 'active' || state.stage !== 'clarify') {
    const detail = problems.length > 0 ? problems.join('; ') : `lifecycle=${state.lifecycle} stage=${state.stage}`;
    throw questionError('EH-QUESTION-ACTIVE-108', `change must be active v6 clarify state: ${detail}`);
  }
}

function ensurePendingParent(root, changeId) {
  const target = pendingQuestionPath(root, changeId);
  const commonDir = gitCommonDir(root);
  try {
    assertNoSymlinkComponents(commonDir, target, 'pending question');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    assertNoSymlinkComponents(commonDir, target, 'pending question');
  } catch (error) {
    throw pathFailure(error);
  }
  return target;
}

function validatePending(pending, expectedChangeId) {
  const problems = [];
  if (!isObject(pending)) return ['pending question must be an object'];
  for (const key of Object.keys(pending)) {
    if (!PENDING_FIELDS.has(key)) problems.push(`pending question has unknown property ${key}`);
  }
  if (pending.pendingVersion !== 1) problems.push('pendingVersion must be 1');
  if (pending.changeId !== expectedChangeId) problems.push(`changeId must be ${expectedChangeId}`);
  if (!isSafeId(pending.questionId)) problems.push('questionId must be a safe identifier');
  if (pending.candidateRef !== questionCandidatePath(expectedChangeId, pending.questionId)) problems.push('candidateRef is not canonical');
  if (!DIGEST.test(String(pending.candidateDigest || ''))) problems.push('candidateDigest must be sha256');
  if (!['pending', 'resolved'].includes(pending.status)) problems.push('status must be pending or resolved');
  if (!isSchemaDateTime(pending.preparedAt)) problems.push('preparedAt must be an RFC3339 date-time');
  if (pending.status === 'pending' && (pending.eventId !== undefined || pending.resolvedAt !== undefined)) {
    problems.push('pending state must not have resolution fields');
  }
  if (pending.status === 'resolved') {
    if (!isSafeId(pending.eventId)) problems.push('resolved state requires a safe eventId');
    if (!isSchemaDateTime(pending.resolvedAt)) problems.push('resolved state requires resolvedAt');
  }
  return problems;
}

function readPending(root, changeId, { required = true } = {}) {
  const target = pendingQuestionPath(root, changeId);
  const commonDir = gitCommonDir(root);
  try {
    assertNoSymlinkComponents(commonDir, target, 'pending question');
  } catch (error) {
    throw pathFailure(error);
  }
  if (!fs.existsSync(target)) {
    if (!required) return null;
    throw questionError('EH-QUESTION-PENDING-111', `no pending question for ${changeId}`);
  }
  let pending;
  try {
    pending = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (error) {
    throw questionError('EH-QUESTION-PENDING-111', `invalid pending question JSON: ${error.message}`);
  }
  const problems = validatePending(pending, changeId);
  if (problems.length > 0) throw questionError('EH-QUESTION-PENDING-111', problems.join('; '));
  return pending;
}

function expectedToolInput(candidate) {
  return {
    questions: [{
      question: candidate.question,
      header: candidate.header,
      options: candidate.options.map(({ id, label, description }) => ({
        label: id === candidate.recommendedOption ? `${label} (Recommended)` : label,
        description,
      })),
      multiSelect: false,
    }],
  };
}

function loadPendingCandidate(root, changeId, pending) {
  const loaded = loadCandidate(root, changeId, pending.candidateRef);
  if (loaded.candidate.questionId !== pending.questionId || loaded.candidateDigest !== pending.candidateDigest) {
    throw questionError('EH-QUESTION-STALE-107', `pending candidate ${pending.questionId} changed`);
  }
  return loaded.candidate;
}

function assertExactToolInput(candidate, toolInput) {
  if (!sameJson(toolInput, expectedToolInput(candidate))) {
    throw questionError(
      'EH-QUESTION-MISMATCH-112',
      `AskUserQuestion input does not exactly match authorized candidate ${candidate.questionId}`,
    );
  }
}

function selectedOption(candidate, toolResponse) {
  const answers = toolResponse?.answers;
  if (!isObject(answers)
      || Object.keys(answers).length !== 1
      || !Object.hasOwn(answers, candidate.question)
      || typeof answers[candidate.question] !== 'string') {
    throw questionError('EH-QUESTION-ANSWER-113', 'tool response must contain exactly one answer for the authorized question');
  }
  const answer = answers[candidate.question];
  const matches = candidate.options.filter(({ id, label }) => (
    answer === (id === candidate.recommendedOption ? `${label} (Recommended)` : label)
  ));
  return matches.length === 1 ? matches[0] : null;
}

function eventIdFor(questionId) {
  const eventId = `D-${questionId.slice(2)}`;
  if (!isSafeId(eventId)) {
    throw questionError('EH-QUESTION-ANSWER-113', `questionId ${questionId} cannot produce a safe decision event ID`);
  }
  return eventId;
}

function eventMatchesCandidate(event, candidate, candidateRef) {
  return event.changeId === candidate.changeId
    && event.stage === 'clarify'
    && sameJson(event.actor, { type: 'user', id: 'interactive-user' })
    && ((event.decisionType === candidate.decisionType && event.targetRef === candidate.targetRef
      && candidate.options.some(({ id }) => id === event.selectedOption))
      || (event.decisionType === 'clarify-answer' && event.targetRef === candidateRef
        && event.selectedOption === 'other'))
    && event.questionId === candidate.questionId
    && sameJson(event.options, event.selectedOption === 'other'
      ? [...candidate.options.map(({ id }) => id), 'other']
      : candidate.options.map(({ id }) => id))
    && event.recommendedOption === candidate.recommendedOption
    && event.publicRationale === (event.selectedOption === 'other'
      ? 'User selected Other; re-clarification is required.'
      : PUBLIC_RATIONALE)
    && sameJson(event.evidenceRefs, candidate.evidenceRefs)
    && sameJson(event.inputDigests, candidate.inputDigests);
}

function findRecordedEvent(root, candidate, candidateRef, expectedEventId) {
  const targeting = readDecisionEvents(root, candidate.changeId).filter((event) => (
    event.targetRef === candidateRef || event.questionId === candidate.questionId
  ));
  const matching = targeting.filter((event) => (
    event.eventId === expectedEventId && eventMatchesCandidate(event, candidate, candidateRef)
  ));
  if (matching.length === 1 && targeting.length === 1) return matching[0];
  if (targeting.length > 0) {
    throw questionError('EH-QUESTION-RECOVERY-114', `decision ledger conflicts with pending candidate ${candidate.questionId}`);
  }
  return null;
}

function resolvedPending(pending, eventId) {
  return { ...pending, status: 'resolved', eventId, resolvedAt: new Date().toISOString() };
}

export function questionCandidatePath(changeId, questionId) {
  assertQuestionSafeId(changeId, 'changeId');
  assertQuestionSafeId(questionId, 'questionId');
  return `harness/changes/${changeId}/evidence/clarify/questions/${questionId}.json`;
}

export function pendingQuestionPath(root, changeId) {
  assertQuestionSafeId(changeId, 'changeId');
  return path.join(gitCommonDir(root), 'enterprise-harness', 'pending-decisions', `${changeId}.json`);
}

export function prepareClarifyQuestion(root, changeId, candidateRef) {
  assertQuestionSafeId(changeId, 'changeId');
  assertActiveClarifyChange(root, changeId);
  const loaded = loadCandidate(root, changeId, candidateRef);
  assertClarifyQuestionFactGate(root, changeId);
  const target = ensurePendingParent(root, changeId);
  return withFileLock(target, () => {
    const current = readPending(root, changeId, { required: false });
    if (current?.status === 'pending') {
      throw questionError('EH-QUESTION-PENDING-110', `question ${current.questionId} must be resolved before preparing another`);
    }
    assertActiveClarifyChange(root, changeId);
    const fresh = loadCandidate(root, changeId, candidateRef);
    assertClarifyQuestionFactGate(root, changeId);
    if (fresh.candidateDigest !== loaded.candidateDigest) {
      throw questionError('EH-QUESTION-STALE-107', `candidate changed while preparing: ${candidateRef}`);
    }
    const resolvedTarget = readDecisionEvents(root, changeId).find((event) => (
      event.decisionType === fresh.candidate.decisionType
      && event.targetRef === fresh.candidate.targetRef
    ));
    if (resolvedTarget) {
      throw questionError(
        'EH-QUESTION-TARGET-115',
        `decision target ${fresh.candidate.decisionType}:${fresh.candidate.targetRef} is already resolved by ${resolvedTarget.eventId}`,
      );
    }
    const pending = {
      pendingVersion: 1,
      changeId,
      questionId: fresh.candidate.questionId,
      candidateRef,
      candidateDigest: fresh.candidateDigest,
      status: 'pending',
      preparedAt: new Date().toISOString(),
    };
    atomicWriteJson(target, pending);
    return Object.freeze({ ...pending });
  });
}

export function authorizeClarifyQuestion(root, toolInput) {
  const changeId = activeChangeId(root);
  if (!changeId) throw questionError('EH-QUESTION-ACTIVE-108', 'no active change is bound');
  assertActiveClarifyChange(root, changeId);
  const pending = readPending(root, changeId);
  if (pending.status !== 'pending') {
    throw questionError('EH-QUESTION-PENDING-111', `question ${pending.questionId} is not pending`);
  }
  const candidate = loadPendingCandidate(root, changeId, pending);
  assertClarifyQuestionFactGate(root, changeId);
  assertExactToolInput(candidate, toolInput);
  return Object.freeze({ changeId, questionId: candidate.questionId });
}

export function resolveClarifyQuestion(root, toolInput, toolResponse) {
  const changeId = activeChangeId(root);
  if (!changeId) throw questionError('EH-QUESTION-ACTIVE-108', 'no active change is bound');
  assertActiveClarifyChange(root, changeId);
  readPending(root, changeId);
  const target = pendingQuestionPath(root, changeId);
  return withFileLock(target, () => {
    const pending = readPending(root, changeId);
    const candidate = loadPendingCandidate(root, changeId, pending);
    assertExactToolInput(candidate, toolInput);
    const selected = selectedOption(candidate, toolResponse);
    const eventId = eventIdFor(candidate.questionId);
    const prior = findRecordedEvent(root, candidate, pending.candidateRef, eventId);
    if (pending.status === 'resolved') {
      if (!prior || pending.eventId !== eventId || prior.selectedOption !== (selected?.id || 'other')) {
        throw questionError('EH-QUESTION-ANSWER-113', 'resolved question cannot be changed or replayed with a different answer');
      }
      return Object.freeze({ eventId, duplicate: true });
    }
    if (prior) {
      if (prior.selectedOption !== (selected?.id || 'other')) {
        throw questionError('EH-QUESTION-ANSWER-113', 'recorded answer does not match the replayed answer');
      }
      atomicWriteJson(target, resolvedPending(pending, eventId));
      return Object.freeze({ eventId, duplicate: true });
    }
    const event = {
      eventVersion: 1,
      type: 'decision-event',
      eventId,
      changeId,
      stage: 'clarify',
      actor: { type: 'user', id: 'interactive-user' },
      decisionType: selected ? candidate.decisionType : 'clarify-answer',
      targetRef: selected ? candidate.targetRef : pending.candidateRef,
      questionId: candidate.questionId,
      options: selected ? candidate.options.map(({ id }) => id) : [...candidate.options.map(({ id }) => id), 'other'],
      recommendedOption: candidate.recommendedOption,
      selectedOption: selected?.id || 'other',
      publicRationale: selected ? PUBLIC_RATIONALE : 'User selected Other; re-clarification is required.',
      evidenceRefs: [...candidate.evidenceRefs],
      inputDigests: { ...candidate.inputDigests },
      recordedAt: new Date().toISOString(),
    };
    const appended = appendDecisionEvent(root, changeId, event);
    atomicWriteJson(target, resolvedPending(pending, eventId));
    return Object.freeze({ eventId, duplicate: appended.duplicate });
  });
}

export function recoverClarifyQuestion(root, changeId, { repair = true } = {}) {
  assertQuestionSafeId(changeId, 'changeId');
  assertActiveClarifyChange(root, changeId);
  const existing = readPending(root, changeId, { required: false });
  if (!existing) return Object.freeze({ status: 'missing', recovery: null });
  const target = pendingQuestionPath(root, changeId);
  return withFileLock(target, () => {
    const pending = readPending(root, changeId);
    const candidate = loadPendingCandidate(root, changeId, pending);
    const eventId = eventIdFor(candidate.questionId);
    const event = findRecordedEvent(root, candidate, pending.candidateRef, eventId);
    if (pending.status === 'resolved') {
      if (!event || pending.eventId !== eventId) {
        throw questionError('EH-QUESTION-RECOVERY-114', `resolved pending state is missing decision event ${eventId}`);
      }
      return Object.freeze({ status: 'resolved', recovery: null, eventId });
    }
    if (!event) {
      return Object.freeze({
        status: 'pending',
        recovery: `重新询问已授权的待回答问题 ${candidate.questionId}，不得修改问题正文或选项。`,
      });
    }
    if (!repair) {
      return Object.freeze({
        status: 'repair-required',
        recovery: `运行 enterprise-harness clarify recover ${changeId}。`,
        eventId,
      });
    }
    atomicWriteJson(target, resolvedPending(pending, eventId));
    return Object.freeze({ status: 'resolved', recovery: null, eventId });
  });
}
