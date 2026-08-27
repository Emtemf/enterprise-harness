import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertSafeId, resolveChild } from './safe-paths.mjs';
import { runtimePaths } from './runtime-paths.mjs';

const LOCK_OWNER_FILE = 'owner.json';
const INVALID_LOCK_GRACE_MS = 30_000;
const WRITE_LEASE_TTL_MS = 60 * 60 * 1000;
const locallyHeldLocks = new Map();
const gitCommonDirCache = new Map();

function lockPathFor(file) {
  return `${file}.lock`;
}

export function withFileLock(file, action) {
  const lock = lockPathFor(file);
  if (locallyHeldLocks.has(lock)) {
    locallyHeldLocks.set(lock, locallyHeldLocks.get(lock) + 1);
    try {
      return action();
    } finally {
      const remaining = locallyHeldLocks.get(lock) - 1;
      if (remaining === 0) locallyHeldLocks.delete(lock);
      else locallyHeldLocks.set(lock, remaining);
    }
  }
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const token = randomUUID();
  // Uncontended acquisition is already atomic and must stay cheap for hook latency.
  // The CAS-backed acquisition gate is needed only when an existing target may
  // require stale-owner recovery.
  if (!tryCreateOwnedLock(lock, token)) {
    withAcquisitionGate(lock, file, () => acquireOwnedLock(lock, file, token));
  }
  locallyHeldLocks.set(lock, 1);
  const cleanup = () => releaseOwnedLock(lock, token);
  // Several CLI gates terminate with process.exit(2). Node does not unwind
  // JavaScript finally blocks in that case, so also remove the owned lock from
  // the synchronous exit event to preserve restartability.
  process.once('exit', cleanup);
  try {
    return action();
  } finally {
    process.removeListener('exit', cleanup);
    locallyHeldLocks.delete(lock);
    cleanup();
  }
}

function withAcquisitionGate(lock, file, action) {
  const gitDir = gitCommonDirForFile(file);
  if (gitDir) return withGitRefAcquisitionGate(gitDir, file, action);
  return withFilesystemAcquisitionGate(lock, file, action);
}

function gitCommonDirForFile(file) {
  let current = path.resolve(path.dirname(file));
  const traversed = [];
  while (true) {
    if (gitCommonDirCache.has(current)) {
      const cached = gitCommonDirCache.get(current);
      for (const directory of traversed) gitCommonDirCache.set(directory, cached);
      return cached;
    }
    traversed.push(current);
    const dotGit = path.join(current, '.git');
    if (path.basename(current) === '.git' && fs.existsSync(path.join(current, 'HEAD'))) {
      for (const directory of traversed) gitCommonDirCache.set(directory, current);
      return current;
    }
    if (fs.existsSync(dotGit)) {
      const result = spawnSync('git', ['rev-parse', '--git-common-dir'], {
        cwd: current,
        encoding: 'utf-8',
        shell: false,
      });
      if (result.status === 0) {
        const gitDir = path.resolve(current, result.stdout.trim());
        for (const directory of traversed) gitCommonDirCache.set(directory, gitDir);
        return gitDir;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function git(gitDir, args, options = {}) {
  return spawnSync('git', [`--git-dir=${gitDir}`, ...args], {
    encoding: 'utf-8',
    shell: false,
    ...options,
  });
}

function gitRefOwner(gitDir, ref) {
  const resolved = git(gitDir, ['rev-parse', '--verify', ref]);
  if (resolved.status !== 0) return null;
  const oid = resolved.stdout.trim();
  const content = git(gitDir, ['cat-file', 'blob', oid]);
  if (content.status !== 0) return { oid, owner: null };
  try {
    return { oid, owner: JSON.parse(content.stdout) };
  } catch {
    return { oid, owner: null };
  }
}

function ownerRecordIsRecoverable(owner) {
  const alive = ownerIsAlive(owner);
  if (alive === false) return true;
  if (alive === true) return false;
  const acquiredAt = Date.parse(owner?.acquiredAt);
  return Number.isFinite(acquiredAt) && Date.now() - acquiredAt >= INVALID_LOCK_GRACE_MS;
}

function withGitRefAcquisitionGate(gitDir, file, action) {
  const token = randomUUID();
  const owner = lockOwner(token);
  const object = git(gitDir, ['hash-object', '-w', '--stdin'], {
    input: `${JSON.stringify(owner)}\n`,
  });
  if (object.status !== 0) {
    throw new Error(`EH-STATE-LOCK-159: cannot create acquisition owner for ${file}: ${object.stderr.trim()}`);
  }
  const ownerOid = object.stdout.trim();
  const digest = createHash('sha256').update(path.resolve(file)).digest('hex');
  const ref = `refs/enterprise-harness/acquisition-gates/${digest}`;
  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt += 1) {
    const observed = gitRefOwner(gitDir, ref);
    if (observed && !ownerRecordIsRecoverable(observed.owner)) {
      throw new Error(`EH-STATE-LOCK-159: lock acquisition/recovery is already serialized for ${file}`);
    }
    const claim = git(gitDir, [
      'update-ref',
      ref,
      ownerOid,
      observed?.oid || '0'.repeat(ownerOid.length),
    ]);
    acquired = claim.status === 0;
  }
  if (!acquired) {
    throw new Error(`EH-STATE-LOCK-159: lock acquisition/recovery is already serialized for ${file}`);
  }
  const cleanup = () => { git(gitDir, ['update-ref', '-d', ref, ownerOid]); };
  process.once('exit', cleanup);
  try {
    return action();
  } finally {
    process.removeListener('exit', cleanup);
    cleanup();
  }
}

function withFilesystemAcquisitionGate(lock, file, action) {
  const gate = `${lock}.acquire`;
  const token = randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt += 1) {
    let directoryCreated = false;
    try {
      fs.mkdirSync(gate);
      directoryCreated = true;
      fs.writeFileSync(path.join(gate, LOCK_OWNER_FILE), `${JSON.stringify(lockOwner(token))}\n`, {
        encoding: 'utf-8', mode: 0o600, flag: 'wx',
      });
      acquired = true;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        if (directoryCreated || readLockOwner(gate)?.token === token) {
          fs.rmSync(gate, { recursive: true, force: true });
        }
        throw error;
      }
      const observedOwner = readLockOwner(gate);
      if (!lockIsRecoverable(gate) || !quarantineStaleLock(gate, observedOwner)) {
        throw new Error(`EH-STATE-LOCK-159: lock acquisition/recovery is already serialized for ${file}`);
      }
    }
  }
  if (!acquired) throw new Error(`EH-STATE-LOCK-159: lock acquisition/recovery is already serialized for ${file}`);
  const cleanup = () => {
    if (readLockOwner(gate)?.token === token) fs.rmSync(gate, { recursive: true, force: true });
  };
  process.once('exit', cleanup);
  try {
    return action();
  } finally {
    process.removeListener('exit', cleanup);
    cleanup();
  }
}

export function withFileLockWait(file, action, options = {}) {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const retryMs = options.retryMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      return withFileLock(file, action);
    } catch (error) {
      if (!/EH-STATE-LOCK-(?:012|159)/u.test(String(error.message)) || Date.now() >= deadline) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs);
    }
  }
}

function lockOwner(token) {
  return {
    version: 1,
    token,
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
  };
}

function readLockOwner(lock) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lock, LOCK_OWNER_FILE), 'utf-8'));
  } catch {
    return null;
  }
}

function ownerIsAlive(owner) {
  if (!owner || owner.hostname !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) return null;
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    return error.code === 'ESRCH' ? false : true;
  }
}

function lockIsRecoverable(lock) {
  const owner = readLockOwner(lock);
  const alive = ownerIsAlive(owner);
  if (alive === false) return true;
  if (alive === true) return false;
  try {
    return Date.now() - fs.statSync(lock).mtimeMs >= INVALID_LOCK_GRACE_MS;
  } catch {
    return true;
  }
}

function quarantineStaleLock(lock, expectedOwner = readLockOwner(lock)) {
  const quarantine = `${lock}.stale.${randomUUID()}`;
  try {
    fs.renameSync(lock, quarantine);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const movedOwner = readLockOwner(quarantine);
  if (movedOwner?.token !== expectedOwner?.token || !lockIsRecoverable(quarantine)) {
    try {
      fs.renameSync(quarantine, lock);
    } catch (restoreError) {
      throw new Error(`EH-STATE-LOCK-012: lock owner changed during stale recovery for ${lock}: ${restoreError.message}`);
    }
    return false;
  }
  fs.rmSync(quarantine, { recursive: true, force: true });
  return true;
}

function acquireOwnedLock(lock, file, token) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (tryCreateOwnedLock(lock, token)) return;
    const observedOwner = readLockOwner(lock);
    if (!lockIsRecoverable(lock) || !quarantineStaleLock(lock, observedOwner)) {
      throw new Error(`EH-STATE-LOCK-012: concurrent update in progress for ${file}`);
    }
  }
  throw new Error(`EH-STATE-LOCK-012: concurrent update in progress for ${file}`);
}

function tryCreateOwnedLock(lock, token) {
  let directoryCreated = false;
  try {
    fs.mkdirSync(lock);
    directoryCreated = true;
    fs.writeFileSync(
      path.join(lock, LOCK_OWNER_FILE),
      `${JSON.stringify(lockOwner(token), null, 2)}\n`,
      { encoding: 'utf-8', mode: 0o600, flag: 'wx' },
    );
    return true;
  } catch (error) {
    if (error.code === 'EEXIST' && !directoryCreated) return false;
    if (directoryCreated) fs.rmSync(lock, { recursive: true, force: true });
    throw error;
  }
}

function releaseOwnedLock(lock, token) {
  const owner = readLockOwner(lock);
  if (owner?.token !== token) return;
  fs.rmSync(lock, { recursive: true, force: true });
}

export function changeTransactionTarget(root, changeId) {
  assertSafeId(changeId, 'changeId');
  return resolveChild(
    path.join(runtimePaths(root).runtimeRoot, 'change-transactions'),
    `${changeId}.transaction`,
    'changeId',
  );
}

export function withChangeTransaction(root, changeId, action) {
  const target = changeTransactionTarget(root, changeId);
  return withFileLock(`${target}-coordinator`, () => {
    removeExpiredWriteLeases(target);
    const liveLeases = listWriteLeases(target);
    if (liveLeases.length) {
      throw new Error(`EH-CHANGE-WRITE-LEASE-151: ${changeId} has ${liveLeases.length} write tool(s) in progress`);
    }
    return withFileLock(target, action);
  });
}

export function changeTransactionInProgress(root, changeId) {
  const lock = lockPathFor(changeTransactionTarget(root, changeId));
  return fs.existsSync(lock) && !lockIsRecoverable(lock);
}

function writeLeaseDirectory(target) {
  return `${target}-write-leases`;
}

function writeLeasePath(target, toolUseId) {
  const digest = createHash('sha256').update(String(toolUseId)).digest('hex');
  return path.join(writeLeaseDirectory(target), `${digest}.json`);
}

function listWriteLeases(target) {
  const directory = writeLeaseDirectory(target);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name));
}

function removeExpiredWriteLeases(target, now = Date.now()) {
  for (const file of listWriteLeases(target)) {
    try {
      const lease = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= now) {
        fs.rmSync(file, { force: true });
      }
    } catch {
      fs.rmSync(file, { force: true });
    }
  }
}

export function acquireChangeWriteLease(root, changeId, toolUseId, options = {}) {
  assertSafeId(changeId, 'changeId');
  if (!String(toolUseId || '').trim()) throw new Error('EH-CHANGE-WRITE-LEASE-152: tool_use_id is required');
  const target = changeTransactionTarget(root, changeId);
  return withFileLock(`${target}-coordinator`, () => {
    removeExpiredWriteLeases(target);
    const transactionLock = lockPathFor(target);
    if (fs.existsSync(transactionLock) && !lockIsRecoverable(transactionLock)) {
      throw new Error(`EH-CHANGE-TRANSACTION-150: ${changeId} transaction is in progress`);
    }
    if (fs.existsSync(transactionLock) && lockIsRecoverable(transactionLock)) quarantineStaleLock(transactionLock);
    const directory = writeLeaseDirectory(target);
    fs.mkdirSync(directory, { recursive: true });
    const lease = {
      version: 1,
      changeId,
      toolUseId: String(toolUseId),
      sessionId: options.sessionId || null,
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (options.ttlMs || WRITE_LEASE_TTL_MS)).toISOString(),
    };
    atomicWriteJson(writeLeasePath(target, toolUseId), lease);
    return lease;
  });
}

export function releaseChangeWriteLease(root, changeId, toolUseId) {
  assertSafeId(changeId, 'changeId');
  if (!String(toolUseId || '').trim()) return false;
  const target = changeTransactionTarget(root, changeId);
  return withFileLock(`${target}-coordinator`, () => {
    const file = writeLeasePath(target, toolUseId);
    const existed = fs.existsSync(file);
    fs.rmSync(file, { force: true });
    return existed;
  });
}

export function changeWriteLeaseExists(root, changeId, toolUseId) {
  if (!String(toolUseId || '').trim()) return false;
  return fs.existsSync(writeLeasePath(changeTransactionTarget(root, changeId), toolUseId));
}

export function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.renameSync(temporary, file);
    } catch (renameError) {
      // Windows: renameSync throws EPERM when the target already exists; unlink first then retry.
      if (renameError.code === 'EPERM' || renameError.code === 'EEXIST') {
        fs.unlinkSync(file);
        fs.renameSync(temporary, file);
      } else {
        throw renameError;
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function appendJsonLineOnce(file, event) {
  if (!event?.eventId) throw new Error('EH-EVENT-ID-013: append-only event requires eventId');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const duplicate = existing.split(/\r?\n/u).some((line) => {
    if (!line) return false;
    try {
      return JSON.parse(line).eventId === event.eventId;
    } catch {
      return false;
    }
  });
  if (!duplicate) fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf-8');
}

export function compareAndSwapJson(file, expectedRevision, nextValue, eventFile = null, event = null) {
  return withFileLock(file, () => {
    const current = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const currentRevision = Number.isInteger(current.revision) ? current.revision : 1;
    if (currentRevision !== expectedRevision) {
      throw new Error(
        `EH-STATE-REVISION-014: expected revision ${expectedRevision}, current revision ${currentRevision}`,
      );
    }
    if (eventFile && event) appendJsonLineOnce(eventFile, event);
    atomicWriteJson(file, nextValue);
    return nextValue;
  });
}
