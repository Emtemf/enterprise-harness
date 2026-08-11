import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { atomicWriteJson } from './state-store.mjs';
import { ensureRuntimePaths, runtimePaths } from './runtime-paths.mjs';
import { assertSafeId } from './safe-paths.mjs';
import { readSession } from './sessions.mjs';

function guardPath(file) {
  return `${file}.guard`;
}

export function acquireChangeLock(root, changeId, sessionId, options = {}) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(sessionId, 'sessionId');
  const binding = readSession(root, sessionId, options);
  if (!binding) {
    throw new Error(`EH-CHANGE-LOCK-003: ${sessionId} must be bound before locking ${changeId}`);
  }
  if (binding.changeId !== changeId) {
    throw new Error(`EH-CHANGE-LOCK-004: ${sessionId} is bound to ${binding.changeId}, not ${changeId}`);
  }
  const paths = ensureRuntimePaths(root, options);
  const file = paths.lockPath(changeId);
  const guard = guardPath(file);
  try {
    fs.mkdirSync(guard);
  } catch (error) {
    if (error.code === 'EEXIST') {
      let owner = 'unknown';
      if (fs.existsSync(file)) {
        try { owner = JSON.parse(fs.readFileSync(file, 'utf-8')).sessionId || owner; } catch { /* report owner as unknown */ }
      }
      throw new Error(`EH-CHANGE-LOCK-001: ${changeId} is locked by ${owner}`);
    }
    throw error;
  }
  const lock = {
    schemaVersion: 1,
    lockId: randomUUID(),
    changeId,
    sessionId,
    acquiredAt: new Date().toISOString(),
  };
  try {
    atomicWriteJson(file, lock);
    return lock;
  } catch (error) {
    fs.rmSync(guard, { recursive: true, force: true });
    throw error;
  }
}

export function readChangeLock(root, changeId, options = {}) {
  const paths = runtimePaths(root, options);
  const file = paths.lockPath(changeId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function isChangeLockStale(lock, options = {}) {
  if (!lock || typeof lock.acquiredAt !== 'string') return false;
  const acquiredAt = Date.parse(lock.acquiredAt);
  if (!Number.isFinite(acquiredAt)) return false;
  const staleAfterMs = Number.isFinite(options.staleAfterMs) ? options.staleAfterMs : 60 * 60 * 1000;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  return now - acquiredAt >= staleAfterMs;
}

export function recoverStaleChangeLock(root, changeId, options = {}) {
  const paths = runtimePaths(root, options);
  const file = paths.lockPath(changeId);
  const guard = guardPath(file);
  const lock = readChangeLock(root, changeId, options);
  if (lock) {
    if (readSession(root, lock.sessionId, options)) return false;
    if (options.recoveryToken !== lock.lockId) return false;
    if (!isChangeLockStale(lock, options)) return false;
    fs.rmSync(file, { force: true });
    fs.rmSync(guard, { recursive: true, force: true });
    return true;
  }
  if (!fs.existsSync(guard)) return false;
  const staleAfterMs = Number.isFinite(options.staleAfterMs) ? options.staleAfterMs : 60 * 60 * 1000;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const guardAge = now - fs.statSync(guard).mtimeMs;
  if (guardAge < staleAfterMs) return false;
  fs.rmSync(guard, { recursive: true, force: true });
  return true;
}

export function releaseChangeLock(root, changeId, sessionId, options = {}) {
  const paths = runtimePaths(root, options);
  const file = paths.lockPath(changeId);
  const guard = guardPath(file);
  if (!fs.existsSync(file) && !fs.existsSync(guard)) return false;
  const lock = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null;
  if (lock && lock.sessionId !== sessionId) {
    throw new Error(`EH-CHANGE-LOCK-002: ${changeId} is owned by ${lock.sessionId}`);
  }
  fs.rmSync(file, { force: true });
  fs.rmSync(guard, { recursive: true, force: true });
  return true;
}

export function withChangeLock(root, changeId, sessionId, action, options = {}) {
  acquireChangeLock(root, changeId, sessionId, options);
  try {
    return action();
  } finally {
    releaseChangeLock(root, changeId, sessionId, options);
  }
}
