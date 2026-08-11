import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteJson, withFileLock } from './state-store.mjs';
import { ensureRuntimePaths, runtimePaths } from './runtime-paths.mjs';
import { assertSafeId } from './safe-paths.mjs';

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
    bindingId: input.bindingId || randomUUID(),
  };
}

export function sessionIdFromEnv(env = process.env) {
  const value = env.CLAUDE_SESSION_ID || env.ENTERPRISE_HARNESS_SESSION_ID || null;
  if (value === null) return null;
  return assertSafeId(value, 'sessionId');
}

export function bindSession(root, input, options = {}) {
  const paths = ensureRuntimePaths(root, options);
  const binding = normalizeBinding(input);
  const file = paths.sessionPath(binding.sessionId);
  return withFileLock(file, () => {
    if (fs.existsSync(file)) {
      const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (existing.changeId !== binding.changeId || existing.worktreePath !== binding.worktreePath) {
        throw new Error(`EH-SESSION-CONFLICT-001: ${binding.sessionId} is already bound to ${existing.changeId}`);
      }
      return existing;
    }
    atomicWriteJson(file, binding);
    return binding;
  });
}

export function readSession(root, sessionId, options = {}) {
  const paths = runtimePaths(root, options);
  const file = paths.sessionPath(sessionId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function listSessions(root, options = {}) {
  const paths = runtimePaths(root, options);
  if (!fs.existsSync(paths.sessionDir)) return [];
  return fs.readdirSync(paths.sessionDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(paths.sessionDir, name), 'utf-8')));
}

export function unbindSession(root, sessionId, options = {}) {
  const paths = runtimePaths(root, options);
  const file = paths.sessionPath(sessionId);
  if (fs.existsSync(file)) fs.rmSync(file);
}
