import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bindSession, renewSessionLease, isSessionLeaseExpired, readSession } from '../lib/sessions.mjs';
import { acquireChangeLock, recoverStaleChangeLock, readChangeLock } from '../lib/change-locks.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-v05-lease-recovery-'));
try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);

  // Scenario 1: expired session lease must be detectable
  const binding = bindSession(root, {
    sessionId: 'lease-probe', changeId: 'probe', worktreePath: root, controllerRevision: 'test',
  }, { leaseMs: 1_000, now: 10_000 });
  assert.equal(isSessionLeaseExpired(binding, { now: 10_999 }), false);
  assert.equal(isSessionLeaseExpired(binding, { now: 11_000 }), true);

  // Scenario 2: renewing extends the lease
  const renewed = renewSessionLease(root, 'lease-probe', { leaseMs: 5_000, now: 11_000 });
  assert.equal(isSessionLeaseExpired(renewed, { now: 15_999 }), false);
  assert.ok(renewed.heartbeatedAt);

  // Scenario 3: expired change lock must be recoverable
  const lock = acquireChangeLock(root, 'probe', 'lease-probe', { leaseMs: 1_000, now: 11_000 });
  const expired = readChangeLock(root, 'probe');
  assert.ok(expired.leaseExpiresAt);
  // Simulate expiry
  const recovered = recoverStaleChangeLock(root, 'probe', {
    now: 20_000, recoveryToken: lock.lockId,
  });
  // Recovery requires session to be unbound first — binding still exists, so it returns false
  assert.equal(recovered, false);

  // Unbind session, then recovery should work
  const sessionFile = path.join(root, '.git', 'enterprise-harness', 'sessions', 'lease-probe.json');
  fs.rmSync(sessionFile);
  const recovered2 = recoverStaleChangeLock(root, 'probe', {
    now: 20_000, recoveryToken: lock.lockId,
  });
  assert.equal(recovered2, true);
  assert.equal(readChangeLock(root, 'probe'), null);

  console.log('PASS v05-scenario-lease-recovery verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
