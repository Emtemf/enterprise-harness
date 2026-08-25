import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  appendDecisionEvent,
  clarifyDecisionSnapshotPath,
  decisionLedgerPath,
  readClarifyDecisionSnapshot,
  readDecisionEvents,
  sealClarifyDecisionSnapshot,
} from '../core/decision-ledger.mjs';
import {
  sha256Artifact,
  validateClarifyDecisionSnapshot,
  validateDecisionEvent,
} from '../lib/result-contract.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-decision-ledger-'));
const digest = (value) => createHash('sha256').update(value).digest('hex');

function eventFor(changeId, eventId, overrides = {}) {
  return {
    eventVersion: 1,
    type: 'decision-event',
    eventId,
    changeId,
    stage: 'clarify',
    actor: { type: 'user', id: 'maintainer' },
    decisionType: 'clarify-answer',
    targetRef: `harness/changes/${changeId}/evidence/clarify/questions/${eventId}.json`,
    questionId: `question-${eventId}`,
    options: ['keep', 'change'],
    recommendedOption: 'keep',
    selectedOption: 'keep',
    publicRationale: `Public rationale for ${eventId}`,
    evidenceRefs: [
      `harness/changes/${changeId}/requirements.md`,
      'src/refund.js:42',
    ],
    inputDigests: { [`harness/changes/${changeId}/requirements.md`]: 'a'.repeat(64) },
    recordedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function writeLedger(changeId, content) {
  const absolute = path.join(root, decisionLedgerPath(changeId));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf-8');
  return absolute;
}

try {
  const changeId = 'clarify-ledger';
  const first = eventFor(changeId, 'decision-1');
  assert.equal(
    decisionLedgerPath(changeId),
    'harness/changes/clarify-ledger/evidence/decisions/decision-ledger.jsonl',
  );
  assert.equal(
    clarifyDecisionSnapshotPath(changeId),
    'harness/changes/clarify-ledger/evidence/decisions/clarify-decision-snapshot.json',
  );
  assert.deepEqual(validateDecisionEvent(changeId, first), []);
  assert.equal(appendDecisionEvent(root, changeId, first).duplicate, false);
  assert.equal(appendDecisionEvent(root, changeId, first).duplicate, true);
  assert.deepEqual(readDecisionEvents(root, changeId), [first]);
  assert.throws(() => appendDecisionEvent(root, '../escape', first), /EH-PATH-001/u);

  for (const invalid of [
    { ...first, changeId: 'other-change' },
    { ...first, eventId: '../unsafe' },
    { ...first, stage: 'design' },
    { ...first, options: { keep: true, change: true } },
    { ...first, recommendedOption: 'missing' },
    { ...first, selectedOption: 'missing' },
    { ...first, evidenceRefs: [] },
    { ...first, inputDigests: {} },
    { ...first, recordedAt: '2026' },
    { ...first, recordedAt: '2026-02-29T00:00:00Z' },
    { ...first, targetRef: '../outside.json' },
    { ...first, targetRef: '/tmp/outside.json' },
    { ...first, evidenceRefs: ['../outside.js:42'] },
    { ...first, evidenceRefs: ['src/refund.js:line'] },
    { ...first, evidenceRefs: ['src/refund.js:0'] },
    { ...first, inputDigests: { '../requirements.md': 'a'.repeat(64) } },
    { ...first, inputDigests: { '/tmp/requirements.md': 'a'.repeat(64) } },
    { ...first, inputDigests: { 'C:\\tmp\\requirements.md': 'a'.repeat(64) } },
    { ...first, untrusted: true },
  ]) {
    assert.notDeepEqual(validateDecisionEvent(changeId, invalid), []);
    assert.throws(
      () => appendDecisionEvent(root, changeId, invalid),
      /EH-DECISION-SCHEMA-101/u,
    );
  }

  assert.throws(
    () => appendDecisionEvent(root, changeId, { ...first, publicRationale: 'Different content' }),
    /EH-DECISION-CONFLICT-102/u,
  );
  assert.deepEqual(readDecisionEvents(root, changeId), [first]);

  const malformedChange = 'malformed-ledger';
  writeLedger(malformedChange, '{not-json}\n');
  assert.throws(() => readDecisionEvents(root, malformedChange), /EH-DECISION-LEDGER-103/u);
  assert.throws(
    () => appendDecisionEvent(root, malformedChange, eventFor(malformedChange, 'decision-malformed')),
    /EH-DECISION-LEDGER-103/u,
  );

  const unterminatedChange = 'unterminated-ledger';
  const unterminated = eventFor(unterminatedChange, 'decision-unterminated');
  writeLedger(unterminatedChange, JSON.stringify(unterminated));
  assert.throws(() => readDecisionEvents(root, unterminatedChange), /EH-DECISION-LEDGER-103/u);

  const contendedChange = 'contended-ledger';
  const contendedPath = path.join(root, decisionLedgerPath(contendedChange));
  fs.mkdirSync(path.dirname(contendedPath), { recursive: true });
  fs.mkdirSync(`${contendedPath}.lock`);
  assert.throws(
    () => appendDecisionEvent(root, contendedChange, eventFor(contendedChange, 'decision-contended')),
    /EH-STATE-LOCK-012/u,
  );
  fs.rmSync(`${contendedPath}.lock`, { recursive: true });

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-decision-escape-'));
  const symlinkChange = 'symlink-ledger';
  const evidence = path.join(root, 'harness', 'changes', symlinkChange, 'evidence');
  fs.mkdirSync(evidence, { recursive: true });
  try {
    fs.symlinkSync(outside, path.join(evidence, 'decisions'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => appendDecisionEvent(root, symlinkChange, eventFor(symlinkChange, 'decision-symlink')),
      /EH-PATH-001/u,
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }

  const prefixChange = 'prefix-ledger';
  const prefixFirst = eventFor(prefixChange, 'prefix-1', { publicRationale: '用户确认保留方案' });
  const prefixSecond = eventFor(prefixChange, 'prefix-2');
  appendDecisionEvent(root, prefixChange, prefixFirst);
  appendDecisionEvent(root, prefixChange, prefixSecond);
  assert.throws(
    () => sealClarifyDecisionSnapshot(root, prefixChange, ['unknown']),
    /EH-DECISION-SNAPSHOT-104/u,
  );
  assert.throws(
    () => sealClarifyDecisionSnapshot(root, prefixChange, [prefixSecond.eventId]),
    /EH-DECISION-SNAPSHOT-104/u,
  );

  const snapshotRef = sealClarifyDecisionSnapshot(root, prefixChange, [prefixFirst.eventId]);
  assert.equal(snapshotRef.path, clarifyDecisionSnapshotPath(prefixChange));
  assert.match(snapshotRef.digest, /^[a-f0-9]{64}$/u);
  assert.equal(snapshotRef.digest, sha256Artifact(root, snapshotRef.path));
  const sealedBytes = fs.readFileSync(path.join(root, snapshotRef.path));
  const sealed = readClarifyDecisionSnapshot(root, prefixChange);
  const expectedPrefix = Buffer.from(`${JSON.stringify(prefixFirst)}\n`, 'utf-8');
  assert.equal(sealed.prefixBytes, expectedPrefix.length);
  assert.equal(sealed.prefixDigest, digest(expectedPrefix));
  assert.deepEqual(sealed.eventIds, [prefixFirst.eventId]);
  assert.deepEqual(validateClarifyDecisionSnapshot(prefixChange, sealed), []);

  appendDecisionEvent(root, prefixChange, eventFor(prefixChange, 'prefix-3'));
  assert.deepEqual(readClarifyDecisionSnapshot(root, prefixChange), sealed);
  assert.deepEqual(fs.readFileSync(path.join(root, snapshotRef.path)), sealedBytes);
  assert.equal(sha256Artifact(root, snapshotRef.path), snapshotRef.digest);
  assert.deepEqual(
    sealClarifyDecisionSnapshot(root, prefixChange, [prefixFirst.eventId]),
    snapshotRef,
    're-sealing the same immutable prefix must be idempotent',
  );

  console.log(`PASS decision-ledger ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
