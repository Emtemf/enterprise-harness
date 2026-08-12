import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bindSession, renewSessionLease, isSessionLeaseExpired } from '../lib/sessions.mjs';
import { acquireChangeLock, isChangeLockStale, renewChangeLockLease } from '../lib/change-locks.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-leases-'));
try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  const binding = bindSession(root, {
    sessionId: 'lease-session', changeId: 'lease-change', worktreePath: root, controllerRevision: 'test',
  }, { leaseMs: 1_000, now: 1_000 });
  assert.equal(binding.leaseExpiresAt, 2_000);
  assert.equal(isSessionLeaseExpired(binding, { now: 1_999 }), false);
  assert.equal(isSessionLeaseExpired(binding, { now: 2_000 }), true);
  const renewed = renewSessionLease(root, 'lease-session', { leaseMs: 2_000, now: 2_000 });
  assert.equal(renewed.leaseExpiresAt, 4_000);

  const lock = acquireChangeLock(root, 'lease-change', 'lease-session', { leaseMs: 1_000, now: 2_000 });
  assert.equal(lock.leaseExpiresAt, 3_000);
  assert.equal(isChangeLockStale(lock, { now: 2_999 }), false);
  assert.equal(isChangeLockStale(lock, { now: 3_000 }), true);
  const renewedLock = renewChangeLockLease(root, 'lease-change', 'lease-session', { leaseMs: 5_000, now: 3_000 });
  assert.equal(renewedLock.leaseExpiresAt, 8_000);

  console.log('PASS runtime-leases verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
