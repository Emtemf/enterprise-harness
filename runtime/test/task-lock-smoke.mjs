import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processIdentityForPid, withRecoverableTaskLock } from '../lib/task-lock.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-task-lock-'));
const lockPath = path.join(root, 'task-execution');
const lock = `${lockPath}.lock`;

try {
  withRecoverableTaskLock(lockPath, () => {
    assert.equal(fs.statSync(lock).isFile(), true, 'lock acquisition must publish one atomic file');
    assert.throws(
      () => withRecoverableTaskLock(lockPath, () => {}),
      /concurrent update/u,
    );
  });
  assert.equal(fs.existsSync(lock), false);

  fs.writeFileSync(lock, '');
  assert.throws(
    () => withRecoverableTaskLock(lockPath, () => {}, { staleAfterMs: 60_000 }),
    /concurrent update/u,
    'a fresh partially initialized lock must never be recovered',
  );
  fs.rmSync(lock);

  const staleTime = new Date(Date.now() - 60_000);
  fs.writeFileSync(lock, `${JSON.stringify({
    pid: 2147483647,
    childPid: process.pid,
    childIdentity: processIdentityForPid(process.pid),
    lockId: 'live-child',
  })}\n`);
  fs.utimesSync(lock, staleTime, staleTime);
  assert.throws(
    () => withRecoverableTaskLock(lockPath, () => {}, { staleAfterMs: 1 }),
    /concurrent update/u,
    'a live task child must keep a stale runner lock unrecoverable',
  );
  fs.rmSync(lock);

  fs.writeFileSync(lock, `${JSON.stringify({ pid: 2147483647, lockId: 'malformed-child' })}\n`);
  fs.utimesSync(lock, staleTime, staleTime);
  fs.writeFileSync(`${lock}.child`, '{invalid');
  assert.throws(
    () => withRecoverableTaskLock(lockPath, () => {}, { staleAfterMs: 1 }),
    /concurrent update|malformed child marker/u,
    'a malformed task child marker must fail closed instead of enabling lock recovery',
  );
  fs.rmSync(`${lock}.child`, { force: true });
  fs.rmSync(lock);

  fs.writeFileSync(lock, `${JSON.stringify({ pid: 2147483647, lockId: 'dead-owner' })}\n`);
  fs.utimesSync(lock, staleTime, staleTime);
  fs.writeFileSync(`${lock}.recover`, `${JSON.stringify({
    pid: process.pid,
    processIdentity: processIdentityForPid(process.pid),
  })}\n`);
  assert.throws(
    () => withRecoverableTaskLock(lockPath, () => {}, { staleAfterMs: 1 }),
    /concurrent update/u,
    'a concurrent stale-lock recovery must not touch the verified lock',
  );
  assert.equal(fs.existsSync(lock), true);
  fs.rmSync(`${lock}.recover`, { recursive: true, force: true });
  fs.writeFileSync(`${lock}.recover`, `${JSON.stringify({ pid: 2147483647, lockId: 'dead-recovery' })}\n`);
  fs.utimesSync(`${lock}.recover`, staleTime, staleTime);
  let recovered = false;
  withRecoverableTaskLock(lockPath, () => { recovered = true; }, { staleAfterMs: 1 });
  assert.equal(recovered, true);
  assert.equal(fs.existsSync(lock), false);

  fs.writeFileSync(lock, `${JSON.stringify({ pid: process.pid, lockId: 'reused-pid' })}\n`);
  const expiredTime = new Date(Date.now() - 120_000);
  fs.utimesSync(lock, expiredTime, expiredTime);
  let reusedPidRecovered = false;
  withRecoverableTaskLock(lockPath, () => { reusedPidRecovered = true; }, {
    staleAfterMs: 1,
    maxOwnerAgeMs: 60_000,
  });
  assert.equal(reusedPidRecovered, true, 'an expired lock must not be pinned by a reused PID');
  assert.equal(fs.existsSync(lock), false);

  console.log(`PASS task-lock ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
