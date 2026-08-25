import fs from 'node:fs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  isSafeRelativePath,
  resolveWithin,
} from '../lib/safe-paths.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { statePathFor, updateChangeState, validateV6State } from './change-state.mjs';
import { appendDecisionEvent, sealClarifyDecisionSnapshot } from './decision-ledger.mjs';
import {
  classifyClarify,
  readClassificationArtifact,
  replaceClassificationArtifact,
} from './classification-artifact.mjs';

const PUBLIC_EVENT_TYPES = new Set(['lane-applicability', 'classification-route']);

function safeId(value, label) {
  try { return assertSafeId(value, label); } catch (error) { throw new Error(`EH-PATH-001: ${error.message}`); }
}

function readJson(root, ref, label, code) {
  if (!isSafeRelativePath(ref)) throw new Error(`EH-PATH-001: ${label} must be a safe repository-relative path`);
  let target;
  try {
    target = resolveWithin(root, ref, label);
    assertNoSymlinkComponents(root, target, label);
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`${code}: missing ${ref}`);
  try { return JSON.parse(fs.readFileSync(target, 'utf-8')); } catch (error) {
    throw new Error(`${code}: invalid JSON in ${ref}: ${error.message}`);
  }
}

function activeClarifyState(root, changeId, code) {
  let state;
  try { state = JSON.parse(fs.readFileSync(statePathFor(root, changeId), 'utf-8')); } catch (error) {
    throw new Error(`${code}: cannot read active v6 Clarify state: ${error.message}`);
  }
  const problems = validateV6State(state, changeId);
  if (problems.length > 0 || state.lifecycle !== 'active' || state.stage !== 'clarify') {
    throw new Error(`${code}: active v6 clarify state required: ${problems.join('; ')}`);
  }
  return state;
}

export function decisionEventInputPath(changeId, eventId) {
  safeId(changeId, 'changeId');
  safeId(eventId, 'eventId');
  return `harness/changes/${changeId}/evidence/clarify/decision-events/${eventId}.json`;
}

export function classificationInputPath(changeId) {
  safeId(changeId, 'changeId');
  return `harness/changes/${changeId}/evidence/clarify/classification-input.json`;
}

function assertFreshBindings(root, event) {
  for (const ref of event.evidenceRefs || []) {
    const artifactRef = ref.match(/^(.*):[1-9]\d*$/u)?.[1] || ref;
    if (!Object.hasOwn(event.inputDigests || {}, artifactRef)) {
      throw new Error(`EH-DECISION-STALE-146: evidenceRefs requires inputDigests.${artifactRef}`);
    }
  }
  for (const [ref, digest] of Object.entries(event.inputDigests || {})) {
    try {
      const target = resolveWithin(root, ref, 'decision event input digest');
      assertNoSymlinkComponents(root, target, 'decision event input digest');
      if (sha256Artifact(root, ref) !== digest) throw new Error(`stale input ${ref}`);
    } catch (error) {
      throw new Error(`EH-DECISION-STALE-146: ${error.message}`);
    }
  }
}

export function recordClarifyDecision(root, changeId, eventRef) {
  safeId(changeId, 'changeId');
  activeClarifyState(root, changeId, 'EH-DECISION-INPUT-147');
  const event = readJson(root, eventRef, 'decision event input', 'EH-DECISION-INPUT-147');
  if (typeof event?.eventId !== 'string' || !event.eventId.trim()) {
    throw new Error('EH-DECISION-INPUT-147: event input requires a safe eventId');
  }
  const canonical = decisionEventInputPath(changeId, event?.eventId);
  if (eventRef !== canonical) throw new Error(`EH-DECISION-INPUT-147: event-ref must be ${canonical}`);
  if (!PUBLIC_EVENT_TYPES.has(event.decisionType) || !['main', 'runtime'].includes(event.actor?.type)) {
    throw new Error('EH-DECISION-INPUT-147: public CLI only accepts main/runtime lane-applicability or classification-route events; user decisions require AskUserQuestion');
  }
  assertFreshBindings(root, event);
  return appendDecisionEvent(root, changeId, event);
}

export function sealClarifyDecisions(root, changeId, eventIds) {
  activeClarifyState(root, changeId, 'EH-DECISION-SNAPSHOT-104');
  return sealClarifyDecisionSnapshot(root, changeId, eventIds);
}

export function persistClarifyClassification(root, changeId, inputRef) {
  safeId(changeId, 'changeId');
  const canonical = classificationInputPath(changeId);
  if (inputRef !== canonical) throw new Error(`EH-CLASSIFICATION-INPUT-148: input-ref must be ${canonical}`);
  const input = readJson(root, inputRef, 'classification input', 'EH-CLASSIFICATION-INPUT-148');
  const classification = classifyClarify(root, changeId, input);
  const state = activeClarifyState(root, changeId, 'EH-CLASSIFICATION-COMMIT-149');
  if (state.artifacts.classification) {
    const existing = readClassificationArtifact(root, changeId, state.artifacts.classification);
    if (JSON.stringify(existing) === JSON.stringify(classification)) {
      return Object.freeze({ ...state.artifacts.classification, duplicate: true, revision: state.revision });
    }
  }
  const committed = replaceClassificationArtifact(root, changeId, classification, (reference) => (
    updateChangeState(root, changeId, (current) => ({
      ...current,
      artifacts: { ...current.artifacts, classification: reference },
      validation: { status: 'stale', digest: null, validatedAt: null },
    }), { expectedRevision: state.revision, type: 'clarify-classification-persisted' })
  ));
  return Object.freeze({ ...committed.artifacts.classification, duplicate: false, revision: committed.revision });
}
