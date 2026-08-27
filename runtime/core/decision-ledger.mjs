import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  pathIsWithin,
  resolveWithin,
} from '../lib/safe-paths.mjs';
import { appendJsonLineOnce, atomicWriteJson, withChangeTransaction, withFileLock } from '../lib/state-store.mjs';
import {
  sha256Artifact,
  validateClarifyDecisionSnapshot,
  validateDecisionEvent,
} from '../lib/result-contract.mjs';

function assertDecisionChangeId(changeId) {
  try {
    return assertSafeId(changeId, 'changeId');
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
}

function pathError(error) {
  if (String(error?.message || '').includes('EH-PATH-001')) return error;
  return new Error(`EH-PATH-001: ${error.message}`);
}

export function decisionLedgerPath(changeId) {
  assertDecisionChangeId(changeId);
  return `harness/changes/${changeId}/evidence/decisions/decision-ledger.jsonl`;
}

export function clarifyDecisionSnapshotPath(changeId) {
  assertDecisionChangeId(changeId);
  return `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`;
}

function resolveDecisionTarget(root, changeId, relativePath, label, { createParent = false } = {}) {
  assertDecisionChangeId(changeId);
  try {
    const changeRoot = resolveWithin(root, `harness/changes/${changeId}`, 'change root');
    let target = resolveWithin(root, relativePath, label);
    if (!pathIsWithin(target, changeRoot)) throw new Error(`${label} escapes its change root`);
    if (createParent) fs.mkdirSync(path.dirname(target), { recursive: true });
    target = resolveWithin(root, relativePath, label);
    if (!pathIsWithin(target, changeRoot)) throw new Error(`${label} escapes its change root`);
    assertNoSymlinkComponents(changeRoot, target, label);
    return target;
  } catch (error) {
    throw pathError(error);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventDigest(event) {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

function ledgerFailure(message) {
  return new Error(`EH-DECISION-LEDGER-103: ${message}`);
}

function readLedgerDocument(root, changeId) {
  const relativePath = decisionLedgerPath(changeId);
  const absolutePath = resolveDecisionTarget(root, changeId, relativePath, 'decision ledger');
  if (!fs.existsSync(absolutePath)) {
    return { relativePath, absolutePath, bytes: Buffer.alloc(0), events: [], prefixEnds: [] };
  }
  const bytes = fs.readFileSync(absolutePath);
  if (bytes.length > 0 && bytes.at(-1) !== 0x0a) {
    throw ledgerFailure(`${relativePath} must end with a newline`);
  }

  const events = [];
  const prefixEnds = [];
  const byEventId = new Map();
  let start = 0;
  let lineNumber = 0;
  for (let cursor = 0; cursor < bytes.length; cursor += 1) {
    if (bytes[cursor] !== 0x0a) continue;
    lineNumber += 1;
    let lineEnd = cursor;
    if (lineEnd > start && bytes[lineEnd - 1] === 0x0d) lineEnd -= 1;
    const line = bytes.subarray(start, lineEnd).toString('utf-8');
    if (!line) throw ledgerFailure(`${relativePath} has an empty line at ${lineNumber}`);
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw ledgerFailure(`${relativePath} has invalid JSON at line ${lineNumber}: ${error.message}`);
    }
    const problems = validateDecisionEvent(changeId, event);
    if (problems.length > 0) {
      throw ledgerFailure(`${relativePath} has an invalid event at line ${lineNumber}: ${problems.join('; ')}`);
    }
    const prior = byEventId.get(event.eventId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(event)) {
      throw new Error(`EH-DECISION-CONFLICT-102: eventId ${event.eventId} already has different content`);
    }
    if (prior) throw ledgerFailure(`${relativePath} repeats eventId ${event.eventId}`);
    byEventId.set(event.eventId, event);
    events.push(event);
    prefixEnds.push(cursor + 1);
    start = cursor + 1;
  }
  return { relativePath, absolutePath, bytes, events, prefixEnds };
}

export function readDecisionEvents(root, changeId) {
  return Object.freeze(readLedgerDocument(root, changeId).events.map((event) => Object.freeze(clone(event))));
}

export function appendDecisionEvent(root, changeId, event) {
  const relativePath = decisionLedgerPath(changeId);
  const problems = validateDecisionEvent(changeId, event);
  if (problems.length > 0) throw new Error(`EH-DECISION-SCHEMA-101: ${problems.join('; ')}`);
  const absolutePath = resolveDecisionTarget(root, changeId, relativePath, 'decision ledger', { createParent: true });
  return withChangeTransaction(root, changeId, () => withFileLock(absolutePath, () => {
    resolveDecisionTarget(root, changeId, relativePath, 'decision ledger');
    const existing = readDecisionEvents(root, changeId);
    const prior = existing.find((item) => item.eventId === event.eventId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(event)) {
      throw new Error(`EH-DECISION-CONFLICT-102: eventId ${event.eventId} already has different content`);
    }
    if (prior) return Object.freeze({ path: relativePath, eventId: event.eventId, duplicate: true });
    const resolvedTarget = event.decisionType === 'classification-route'
      ? null
      : existing.find((item) => (
        item.decisionType === event.decisionType && item.targetRef === event.targetRef
      ));
    if (resolvedTarget) {
      throw new Error(
        `EH-DECISION-TARGET-106: ${event.decisionType}:${event.targetRef} is already resolved by ${resolvedTarget.eventId}`,
      );
    }
    resolveDecisionTarget(root, changeId, relativePath, 'decision ledger');
    appendJsonLineOnce(absolutePath, clone(event));
    return Object.freeze({ path: relativePath, eventId: event.eventId, duplicate: false });
  }));
}

function writeExclusiveSnapshot(root, changeId, relativePath, snapshot) {
  const absolutePath = resolveDecisionTarget(
    root,
    changeId,
    relativePath,
    'clarify decision snapshot',
    { createParent: true },
  );
  const temporary = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx',
    });
    resolveDecisionTarget(root, changeId, relativePath, 'clarify decision snapshot');
    fs.linkSync(temporary, absolutePath);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`EH-DECISION-SNAPSHOT-105: immutable snapshot already exists at ${relativePath}`);
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return absolutePath;
}

function assertRequestedPrefix(eventIds, events) {
  if (!Array.isArray(eventIds) || eventIds.length === 0
      || eventIds.some((eventId) => {
        try {
          assertSafeId(eventId, 'eventId');
          return false;
        } catch {
          return true;
        }
      })
      || new Set(eventIds).size !== eventIds.length
      || eventIds.length > events.length
      || eventIds.some((eventId, index) => events[index]?.eventId !== eventId)) {
    throw new Error('EH-DECISION-SNAPSHOT-104: eventIds must be the exact ordered decision-ledger prefix');
  }
}

export function sealClarifyDecisionSnapshot(root, changeId, eventIds) {
  const ledgerRelativePath = decisionLedgerPath(changeId);
  const snapshotRelativePath = clarifyDecisionSnapshotPath(changeId);
  const ledgerAbsolutePath = resolveDecisionTarget(
    root,
    changeId,
    ledgerRelativePath,
    'decision ledger',
    { createParent: true },
  );
  resolveDecisionTarget(
    root,
    changeId,
    snapshotRelativePath,
    'clarify decision snapshot',
    { createParent: true },
  );

  return withChangeTransaction(root, changeId, () => withFileLock(ledgerAbsolutePath, () => {
    const ledger = readLedgerDocument(root, changeId);
    assertRequestedPrefix(eventIds, ledger.events);
    const existingSnapshotPath = resolveDecisionTarget(root, changeId, snapshotRelativePath, 'clarify decision snapshot');
    if (fs.existsSync(existingSnapshotPath)) {
      const existing = readClarifyDecisionSnapshot(root, changeId);
      if (JSON.stringify(existing.eventIds) === JSON.stringify(eventIds)) {
        return Object.freeze({ path: snapshotRelativePath, digest: sha256Artifact(root, snapshotRelativePath) });
      }
      const extendsExisting = existing.eventIds.length < eventIds.length
        && existing.eventIds.every((eventId, index) => eventIds[index] === eventId);
      if (!extendsExisting) {
        throw new Error(`EH-DECISION-SNAPSHOT-105: new snapshot must extend the current immutable prefix at ${snapshotRelativePath}`);
      }
    }
    const prefixBytes = ledger.prefixEnds[eventIds.length - 1];
    const prefix = ledger.bytes.subarray(0, prefixBytes);
    const eventsById = new Map(ledger.events.map((event) => [event.eventId, event]));
    const snapshot = {
      snapshotVersion: 1,
      type: 'clarify-decision-snapshot',
      changeId,
      eventIds: [...eventIds],
      ledgerRef: {
        path: ledgerRelativePath,
        digest: sha256Artifact(root, ledgerRelativePath),
      },
      prefixBytes: prefix.length,
      prefixDigest: createHash('sha256').update(prefix).digest('hex'),
      artifacts: eventIds.map((eventId) => ({ eventId, digest: eventDigest(eventsById.get(eventId)) })),
      sealedAt: new Date().toISOString(),
    };
    const problems = validateClarifyDecisionSnapshot(changeId, snapshot);
    if (problems.length > 0) throw new Error(`EH-DECISION-SNAPSHOT-104: ${problems.join('; ')}`);

    const snapshotAbsolutePath = resolveDecisionTarget(
      root,
      changeId,
      snapshotRelativePath,
      'clarify decision snapshot',
    );
    return withFileLock(snapshotAbsolutePath, () => {
      if (fs.existsSync(snapshotAbsolutePath)) {
        const previous = JSON.parse(fs.readFileSync(snapshotAbsolutePath, 'utf-8'));
        const historyRelativePath = `harness/changes/${changeId}/evidence/decisions/snapshots/${previous.prefixDigest}.json`;
        const historyAbsolutePath = resolveDecisionTarget(
          root, changeId, historyRelativePath, 'clarify decision snapshot history', { createParent: true },
        );
        if (fs.existsSync(historyAbsolutePath)) {
          let archived;
          try {
            archived = JSON.parse(fs.readFileSync(historyAbsolutePath, 'utf-8'));
          } catch (error) {
            throw new Error(`EH-DECISION-SNAPSHOT-105: invalid immutable history at ${historyRelativePath}: ${error.message}`);
          }
          if (JSON.stringify(archived) !== JSON.stringify(previous)) {
            throw new Error(`EH-DECISION-SNAPSHOT-105: immutable history conflicts at ${historyRelativePath}`);
          }
        } else {
          writeExclusiveSnapshot(root, changeId, historyRelativePath, previous);
        }
        atomicWriteJson(snapshotAbsolutePath, snapshot);
      } else {
        writeExclusiveSnapshot(root, changeId, snapshotRelativePath, snapshot);
      }
      return Object.freeze({
        path: snapshotRelativePath,
        digest: sha256Artifact(root, snapshotRelativePath),
      });
    });
  }));
}

export function readClarifyDecisionSnapshot(root, changeId) {
  const relativePath = clarifyDecisionSnapshotPath(changeId);
  const absolutePath = resolveDecisionTarget(root, changeId, relativePath, 'clarify decision snapshot');
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`EH-DECISION-SNAPSHOT-104: missing ${relativePath}`);
  }
  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  } catch (error) {
    throw new Error(`EH-DECISION-SNAPSHOT-104: invalid snapshot JSON: ${error.message}`);
  }
  const problems = validateClarifyDecisionSnapshot(changeId, snapshot);
  const expectedLedgerPath = decisionLedgerPath(changeId);
  if (snapshot?.ledgerRef?.path !== expectedLedgerPath) {
    problems.push(`ledgerRef.path must be ${expectedLedgerPath}`);
  }

  let ledger;
  try {
    ledger = readLedgerDocument(root, changeId);
  } catch (error) {
    problems.push(error.message);
  }
  if (ledger) {
    const prefix = ledger.bytes.subarray(0, snapshot.prefixBytes);
    if (snapshot.prefixBytes > ledger.bytes.length
        || !ledger.prefixEnds.includes(snapshot.prefixBytes)
        || createHash('sha256').update(prefix).digest('hex') !== snapshot.prefixDigest) {
      problems.push('sealed ledger prefix is stale');
    }
    const prefixEvents = ledger.events.slice(0, snapshot.eventIds?.length || 0);
    if (JSON.stringify(prefixEvents.map((event) => event.eventId)) !== JSON.stringify(snapshot.eventIds)) {
      problems.push('eventIds do not match the sealed ledger prefix');
    }
    const actualArtifacts = prefixEvents.map((event) => ({ eventId: event.eventId, digest: eventDigest(event) }));
    if (JSON.stringify(actualArtifacts) !== JSON.stringify(snapshot.artifacts)) {
      problems.push('artifacts do not match the sealed ledger prefix');
    }
  }
  if (problems.length > 0) throw new Error(`EH-DECISION-SNAPSHOT-104: ${problems.join('; ')}`);
  return Object.freeze(clone(snapshot));
}
