import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireChangeWriteLease,
  changeTransactionTarget,
  releaseChangeWriteLease,
  withChangeTransaction,
} from '../lib/state-store.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-change-lease-'));
const changeId = 'lease-fixture';
fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });

try {
  acquireChangeWriteLease(root, changeId, 'tool-write-1', { sessionId: 'session-1' });
  assert.equal(
    changeTransactionTarget(root, changeId).startsWith(path.join(root, 'harness', 'changes')),
    false,
    'transaction locks and write leases must live outside tool-writable change artifacts',
  );
  assert.throws(
    () => withChangeTransaction(root, changeId, () => 'must-not-run'),
    /EH-CHANGE-WRITE-LEASE-151/u,
    'a PreToolUse lease must exclude a stage transaction until PostToolUse',
  );
  assert.equal(releaseChangeWriteLease(root, changeId, 'tool-write-1'), true);
  assert.equal(withChangeTransaction(root, changeId, () => 'committed'), 'committed');

  const target = changeTransactionTarget(root, changeId);
  const lock = `${target}.lock`;
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({
    version: 1,
    token: 'killed-owner',
    pid: 2_147_483_647,
    hostname: os.hostname(),
    acquiredAt: '2026-08-01T00:00:00.000Z',
  }));
  assert.equal(
    withChangeTransaction(root, changeId, () => 'recovered'),
    'recovered',
    'the next transaction must automatically recover a lock owned by a dead local process',
  );
  assert.equal(fs.existsSync(lock), false);

  console.log(`PASS change-transaction-lease ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
