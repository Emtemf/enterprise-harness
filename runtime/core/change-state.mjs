import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { compareAndSwapJson } from '../lib/state-store.mjs';
import { assertSafeId, resolveChild } from '../lib/safe-paths.mjs';

const V6_STAGES = new Set(['clarify', 'design', 'plan', 'implement', 'verify', 'archive']);
const V6_LIFECYCLES = new Set(['active', 'archived', 'abandoned']);
const V6_LEGACY_FIELDS = new Set(['state', 'status', 'workflow', 'gates', 'approvals', 'tddEvidence', 'route']);
const V6_IMPACT_VALUES = new Set(['yes', 'no', 'unknown']);

export function statePathFor(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return path.join(resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId'), 'state.json');
}

export function eventLogPathFor(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return path.join(resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId'), 'evidence', 'workflow-events.jsonl');
}

export function validateV6State(state) {
  const problems = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return ['state must be an object'];
  for (const field of V6_LEGACY_FIELDS) {
    if (field in state) problems.push(`legacy field is forbidden in v6 state: ${field}`);
  }
  if (state.schemaVersion !== 6) problems.push('schemaVersion must be 6');
  if (!Number.isInteger(state.revision) || state.revision < 1) problems.push('revision must be a positive integer');
  try {
    assertSafeId(state.changeId, 'changeId');
  } catch (error) {
    problems.push(error.message);
  }
  if (!V6_LIFECYCLES.has(state.lifecycle)) problems.push('lifecycle is invalid');
  if (!V6_STAGES.has(state.stage)) problems.push('stage is invalid');
  if (!state.impact || typeof state.impact !== 'object') {
    problems.push('impact is missing');
  } else {
    for (const key of ['api', 'data', 'architecture', 'rule', 'security']) {
      if (!V6_IMPACT_VALUES.has(state.impact[key])) problems.push(`impact.${key} is invalid`);
    }
  }
  if (!state.artifacts || typeof state.artifacts !== 'object' || Array.isArray(state.artifacts)) {
    problems.push('artifacts must be an object');
  }
  if (!state.validation || !['missing', 'stale', 'fresh'].includes(state.validation.status)) {
    problems.push('validation.status is invalid');
  }
  return problems;
}

function immutableClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function updateChangeState(root, changeId, mutate, { expectedRevision = null, type = 'state-updated', actor = 'runtime' } = {}) {
  if (typeof mutate !== 'function') throw new Error('EH-STATE-MUTATE-015: mutate must be a function');
  const statePath = statePathFor(root, changeId);
  const eventPath = eventLogPathFor(root, changeId);
  if (!fs.existsSync(statePath)) throw new Error(`EH-STATE-NOT-FOUND-016: state does not exist for ${changeId}`);

  const current = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  if (current.schemaVersion !== 6) {
    throw new Error(`EH-STATE-V6-017: ${changeId} is schema v${current.schemaVersion}; explicitly migrate it before v6 mutation`);
  }
  const revision = current.revision;
  if (expectedRevision !== null && revision !== expectedRevision) {
    throw new Error(`EH-STATE-REVISION-014: expected revision ${expectedRevision}, current revision ${revision}`);
  }

  const input = immutableClone(current);
  const candidate = mutate(input);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('EH-STATE-MUTATE-015: mutate must return a state object');
  }
  const next = immutableClone({ ...candidate, revision: revision + 1 });
  const problems = validateV6State(next);
  if (problems.length > 0) throw new Error(`EH-STATE-SCHEMA-018: ${problems.join('; ')}`);
  const event = {
    eventId: `v6_${randomUUID()}`,
    type,
    actor,
    changeId,
    revision: next.revision,
    timestamp: new Date().toISOString(),
  };
  return compareAndSwapJson(statePath, revision, next, eventPath, event);
}
