import fs from 'node:fs';
import path from 'node:path';
import { compareAndSwapJson } from '../lib/state-store.mjs';
import { assertSafeId, resolveChild } from '../lib/safe-paths.mjs';
import { randomUUID } from 'node:crypto';

/**
 * Compatibility CAS-based state mutation for v4/v5 states.
 * Unlike the v6-only updateChangeState(), this works with any schema
 * version that has a numeric `revision` field. It performs:
 *
 *   read → revision++ → CAS → event append
 *
 * This replaces the raw writeJson() calls that previously bypassed
 * concurrency safety in lifecycle.mjs.
 */

function changeDir(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
}

function statePath(root, changeId) {
  return path.join(changeDir(root, changeId), 'state.json');
}

function eventLogPath(root, changeId) {
  return path.join(changeDir(root, changeId), 'evidence', 'workflow-events.jsonl');
}

export function readChangeState(root, changeId) {
  const p = statePath(root, changeId);
  if (!fs.existsSync(p)) throw new Error(`EH-STATE-NOT-FOUND-016: state does not exist for ${changeId}`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function saveChangeState(root, changeId, mutator, { type = 'lifecycle-update', actor = 'lifecycle' } = {}) {
  if (typeof mutator !== 'function') throw new Error('EH-STATE-MUTATE-015: mutator must be a function');
  const p = statePath(root, changeId);
  if (!fs.existsSync(p)) throw new Error(`EH-STATE-NOT-FOUND-016: state does not exist for ${changeId}`);

  const current = JSON.parse(fs.readFileSync(p, 'utf-8'));
  const revision = Number.isInteger(current.revision) ? current.revision : 1;
  const next = mutator(JSON.parse(JSON.stringify(current)));
  if (!next || typeof next !== 'object') throw new Error('EH-STATE-MUTATE-015: mutator must return a state object');
  next.revision = revision + 1;

  const event = {
    eventId: `lc_${randomUUID()}`,
    type,
    actor,
    changeId,
    revision: next.revision,
    timestamp: new Date().toISOString(),
  };
  return compareAndSwapJson(p, revision, next, eventLogPath(root, changeId), event);
}

export { statePath, changeDir };
