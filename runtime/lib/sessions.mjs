import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteJson, withFileLock } from './state-store.mjs';
import { ensureRuntimePaths, runtimePaths } from './runtime-paths.mjs';
import { assertSafeId } from './safe-paths.mjs';

function validateStoredBinding(input, expectedSessionId) {
  if (!input || input.schemaVersion !== 1) throw new Error('invalid schemaVersion');
  const sessionId = assertSafeId(input.sessionId, 'sessionId');
  if (sessionId !== expectedSessionId) throw new Error('sessionId mismatch');
  const changeId = assertSafeId(input.changeId, 'changeId');
  for (const [name, value] of [
    ['worktreePath', input.worktreePath],
    ['controllerRevision', input.controllerRevision],
  ]) {
    if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
      throw new Error(`${name} is required`);
    }
  }
  const worktreePath = path.resolve(input.worktreePath);
  const subjectRoot = path.resolve(input.subjectRoot || input.worktreePath);
  if (!path.isAbsolute(worktreePath) || !path.isAbsolute(subjectRoot)) {
    throw new Error('binding roots must be absolute');
  }
  if (!Number.isFinite(input.leaseExpiresAt)) throw new Error('leaseExpiresAt is required');
  if (typeof input.boundAt !== 'string' || input.boundAt.length === 0) throw new Error('boundAt is required');
  return {
    ...input,
    schemaVersion: 1,
    sessionId,
    changeId,
    worktreePath,
    subjectRoot,
  };
}

function normalizeBinding(input) {
  const sessionId = assertSafeId(input?.sessionId, 'sessionId');
  const changeId = assertSafeId(input?.changeId, 'changeId');
  if (typeof input.worktreePath !== 'string' || input.worktreePath.length === 0) {
    throw new Error('EH-SESSION-INPUT-001: worktreePath is required');
  }
  if (typeof input.controllerRevision !== 'string' || input.controllerRevision.length === 0) {
    throw new Error('EH-SESSION-INPUT-001: controllerRevision is required');
  }
  return {
    schemaVersion: 1,
    sessionId,
    changeId,
    worktreePath: path.resolve(input.worktreePath),
    controllerRevision: input.controllerRevision,
    subjectRoot: input.subjectRoot ? path.resolve(input.subjectRoot) : path.resolve(input.worktreePath),
    boundAt: input.boundAt || new Date().toISOString(),
    leaseExpiresAt: Number.isFinite(input.leaseExpiresAt)
      ? input.leaseExpiresAt
      : (Number.isFinite(input.now) ? input.now : Date.now()) + (Number.isFinite(input.leaseMs) ? input.leaseMs : 15 * 60 * 1000),
    bindingId: input.bindingId || randomUUID(),
  };
}

export function sessionIdFromEnv(env = process.env) {
  const value = env.CLAUDE_SESSION_ID || env.ENTERPRISE_HARNESS_SESSION_ID || null;
  if (value === null) return null;
  return assertSafeId(value, 'sessionId');
}

export function persistSessionId(sessionId, env = process.env, fsModule = fs) {
  const normalized = assertSafeId(sessionId, 'sessionId');
  const envFile = typeof env.CLAUDE_ENV_FILE === 'string' ? env.CLAUDE_ENV_FILE.trim() : '';
  if (!envFile) return { ok: false, status: 'not-configured', sessionId: normalized };

  const line = `export ENTERPRISE_HARNESS_SESSION_ID='${normalized}'\n`;
  const existing = fsModule.existsSync(envFile) ? fsModule.readFileSync(envFile, 'utf-8') : '';
  if (!existing.includes(line)) {
    fsModule.mkdirSync(path.dirname(envFile), { recursive: true });
    fsModule.appendFileSync(envFile, line, { mode: 0o600 });
  }
  return { ok: true, status: existing.includes(line) ? 'already-present' : 'persisted', sessionId: normalized };
}

export function isSessionLeaseExpired(binding, { now = Date.now() } = {}) {
  return !Number.isFinite(binding?.leaseExpiresAt) || now >= binding.leaseExpiresAt;
}

export function renewSessionLease(root, sessionId, { leaseMs = 15 * 60 * 1000, now = Date.now(), ...options } = {}) {
  const paths = ensureRuntimePaths(root, options);
  const file = paths.sessionPath(assertSafeId(sessionId, 'sessionId'));
  if (!fs.existsSync(file)) throw new Error(`EH-SESSION-LEASE-023: ${sessionId} is not bound`);
  return withFileLock(file, () => {
    const current = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const next = { ...current, leaseExpiresAt: now + leaseMs, heartbeatedAt: new Date(now).toISOString() };
    atomicWriteJson(file, next);
    return next;
  });
}

export function bindSession(root, input, options = {}) {
  const paths = ensureRuntimePaths(root, options);
  const binding = normalizeBinding({ ...input, now: options.now, leaseMs: options.leaseMs });
  const file = paths.sessionPath(binding.sessionId);
  return withFileLock(file, () => {
    if (fs.existsSync(file)) {
      const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (existing.changeId !== binding.changeId || existing.worktreePath !== binding.worktreePath) {
        throw new Error(`EH-SESSION-CONFLICT-001: ${binding.sessionId} is already bound to ${existing.changeId}`);
      }
      const now = Number.isFinite(options.now) ? options.now : Date.now();
      const renewed = {
        ...existing,
        leaseExpiresAt: binding.leaseExpiresAt,
        heartbeatedAt: new Date(now).toISOString(),
      };
      atomicWriteJson(file, renewed);
      return renewed;
    }
    atomicWriteJson(file, binding);
    return binding;
  });
}

export function readSession(root, sessionId, options = {}) {
  const normalizedSessionId = assertSafeId(sessionId, 'sessionId');
  const paths = runtimePaths(root, options);
  const file = paths.sessionPath(normalizedSessionId);
  if (!fs.existsSync(file)) return null;
  try {
    return validateStoredBinding(
      JSON.parse(fs.readFileSync(file, 'utf-8')),
      normalizedSessionId,
    );
  } catch {
    return null;
  }
}

export function listSessions(root, options = {}) {
  const paths = runtimePaths(root, options);
  if (!fs.existsSync(paths.sessionDir)) return [];
  return fs.readdirSync(paths.sessionDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readSession(root, name.slice(0, -5), options))
    .filter(Boolean);
}

export function unbindSession(root, sessionId, options = {}) {
  const paths = runtimePaths(root, options);
  const file = paths.sessionPath(sessionId);
  return withFileLock(file, () => {
    if (!fs.existsSync(file)) return false;
    fs.rmSync(file);
    return true;
  });
}
