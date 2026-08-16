import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEFAULT_STALE_AFTER_MS = 30_000;
const DEFAULT_MAX_OWNER_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform === 'linux') {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
      const commandEnd = stat.lastIndexOf(')');
      if (commandEnd < 0) return null;
      const fieldsAfterCommand = stat.slice(commandEnd + 2).trim().split(/\s+/u);
      return fieldsAfterCommand[19] || null;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EACCES') return null;
      throw error;
    }
  }
  try {
    if (process.platform === 'darwin') {
      return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
        encoding: 'utf-8',
        timeout: 1_000,
      }).trim() || null;
    }
    if (process.platform === 'win32') {
      return execFileSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid}).StartTime.ToUniversalTime().Ticks`,
      ], { encoding: 'utf-8', timeout: 1_000 }).trim() || null;
    }
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null;
  }
  return null;
}

export function processIdentityForPid(pid) {
  return processIdentity(pid);
}

function childMarkerPath(lock) {
  return `${lock}.child`;
}

function readChildMarker(lock) {
  try {
    return JSON.parse(fs.readFileSync(childMarkerPath(lock), 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return null;
  }
}

function removeOrphanChildMarker(lock, lockId) {
  const marker = readChildMarker(lock);
  if (marker && marker.lockId !== lockId) fs.rmSync(childMarkerPath(lock), { force: true });
}

function readLock(lock) {
  try {
    const stat = fs.statSync(lock);
    const owner = JSON.parse(fs.readFileSync(lock, 'utf-8'));
    return {
      exists: true,
      mtimeMs: stat.mtimeMs,
      dev: stat.dev,
      ino: stat.ino,
      owner,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false };
    try {
      const fallbackStat = fs.statSync(lock);
      return {
        exists: true,
        mtimeMs: fallbackStat.mtimeMs,
        dev: fallbackStat.dev,
        ino: fallbackStat.ino,
        owner: null,
      };
    } catch (statError) {
      if (statError.code === 'ENOENT') return { exists: false };
      throw statError;
    }
  }
}

function canRecoverLock(lock, staleAfterMs, maxOwnerAgeMs) {
  const observed = readLock(lock);
  if (!observed.exists) return true;
  const ageMs = Date.now() - observed.mtimeMs;
  if (ageMs < staleAfterMs) return false;

  const child = readChildMarker(lock) || observed.owner;
  const childPid = Number(child?.childPid);
  if (processIsAlive(childPid)) {
    const childIdentity = child?.childIdentity || null;
    const currentChildIdentity = processIdentity(childPid);
    if (!childIdentity || !currentChildIdentity || childIdentity === currentChildIdentity) {
      return false;
    }
  }
  const pid = Number(observed.owner?.pid);
  if (!processIsAlive(pid)) return true;

  const recordedIdentity = observed.owner?.processIdentity || null;
  const currentIdentity = processIdentity(pid);
  if (recordedIdentity && currentIdentity) {
    return recordedIdentity !== currentIdentity;
  }
  return ageMs >= maxOwnerAgeMs;
}

function acquireRecoveryGuard(target, staleAfterMs) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor = null;
    try {
      descriptor = fs.openSync(target, 'wx', 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify({
        pid: process.pid,
        processIdentity: processIdentity(process.pid),
      })}\n`, 'utf-8');
      fs.closeSync(descriptor);
      return true;
    } catch (error) {
      if (descriptor !== null) fs.closeSync(descriptor);
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(fs.readFileSync(target, 'utf-8'));
      } catch {
        let stat;
        try {
          stat = fs.statSync(target);
        } catch (statError) {
          if (statError.code === 'ENOENT') continue;
          throw statError;
        }
        if (Date.now() - stat.mtimeMs < staleAfterMs) return false;
        fs.rmSync(target, { recursive: true, force: true });
        continue;
      }
      const pid = Number(owner?.pid);
      const recordedIdentity = owner?.processIdentity || null;
      const currentIdentity = processIdentity(pid);
      const alive = processIsAlive(pid)
        && (!recordedIdentity || !currentIdentity || recordedIdentity === currentIdentity);
      if (alive) return false;
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
  return false;
}

function releaseRecoveryGuard(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function sameLockStat(left, right) {
  return left?.exists && right?.exists && left.dev === right.dev && left.ino === right.ino;
}

function removeLockInode(lock, expectedStat) {
  if (!expectedStat) return;
  try {
    const current = fs.statSync(lock);
    if (current.dev === expectedStat.dev && current.ino === expectedStat.ino) {
      fs.rmSync(lock, { force: true });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function removeOwnedLock(lock, lockId) {
  const observed = readLock(lock);
  if (observed.owner?.lockId === lockId) {
    fs.rmSync(lock, { force: true });
  }
}

export function updateTaskLockChild(lockPath, lockId, childPid) {
  const lock = `${lockPath}.lock`;
  const observed = readLock(lock);
  if (observed.owner?.lockId !== lockId) {
    throw new Error(`EH-STATE-LOCK-012: task lock ownership changed for ${lockPath}`);
  }
  fs.writeFileSync(childMarkerPath(lock), `${JSON.stringify({
    lockId,
    childPid,
    childIdentity: processIdentity(childPid),
  })}\n`, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
}

export function clearTaskLockChild(lockPath, lockId) {
  const lock = `${lockPath}.lock`;
  const marker = readChildMarker(lock);
  if (marker?.lockId === lockId) fs.rmSync(childMarkerPath(lock), { force: true });
}

export function withRecoverableTaskLock(
  lockPath,
  action,
  {
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    maxOwnerAgeMs = DEFAULT_MAX_OWNER_AGE_MS,
  } = {},
) {
  const lock = `${lockPath}.lock`;
  const lockId = crypto.randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 2 && !acquired; attempt += 1) {
    let descriptor = null;
    let acquiredStat = null;
    try {
      descriptor = fs.openSync(lock, 'wx', 0o600);
      acquiredStat = fs.fstatSync(descriptor);
      fs.writeFileSync(descriptor, `${JSON.stringify({
        pid: process.pid,
        processIdentity: processIdentity(process.pid),
        lockId,
      })}\n`, 'utf-8');
      fs.closeSync(descriptor);
      descriptor = null;
      acquired = true;
    } catch (error) {
      if (descriptor !== null) {
        fs.closeSync(descriptor);
        removeLockInode(lock, acquiredStat);
      }
      if (error.code !== 'EEXIST') throw error;
      const recoveryGuard = `${lock}.recover`;
      if (!acquireRecoveryGuard(recoveryGuard, staleAfterMs)) {
        throw new Error(`EH-STATE-LOCK-012: concurrent update in progress for ${lockPath}`);
      }
      try {
        const observed = readLock(lock);
        if (!canRecoverLock(lock, staleAfterMs, maxOwnerAgeMs)) {
          throw new Error(`EH-STATE-LOCK-012: concurrent update in progress for ${lockPath}`);
        }
        const current = readLock(lock);
        if (!sameLockStat(observed, current)) continue;
        const quarantine = `${lock}.stale-${crypto.randomUUID()}`;
        try {
          if (current.owner) {
            fs.linkSync(lock, quarantine);
            const verified = readLock(lock);
            if (!sameLockStat(current, verified)) {
              fs.rmSync(quarantine, { force: true });
              continue;
            }
            fs.unlinkSync(lock);
            fs.rmSync(quarantine, { force: true });
          } else {
            fs.renameSync(lock, quarantine);
            fs.rmSync(quarantine, { recursive: true, force: true });
          }
        } catch (quarantineError) {
          if (quarantineError.code !== 'ENOENT') throw quarantineError;
        }
      } finally {
        releaseRecoveryGuard(recoveryGuard);
      }
    }
  }
  if (!acquired) throw new Error(`EH-STATE-LOCK-012: concurrent update in progress for ${lockPath}`);
  removeOrphanChildMarker(lock, lockId);
  try {
    return action({ lockPath, lockId });
  } finally {
    removeOwnedLock(lock, lockId);
  }
}
