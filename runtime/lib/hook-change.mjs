import path from 'node:path';
import { gitCommonDir } from './agent-evidence.mjs';
import { loadActiveChange } from './gates.mjs';
import { heartbeatSessionLease } from './sessions.mjs';

export function hookSessionId(event) {
  const value = typeof event?.session_id === 'string' ? event.session_id.trim() : '';
  return value || null;
}

export function hookRoot(root, event = {}) {
  const cwd = typeof event.cwd === 'string' && event.cwd.trim() ? event.cwd : root;
  return path.resolve(cwd);
}

export function hookRepoRoot(root, event = {}) {
  const cwd = hookRoot(root, event);
  return path.resolve(gitCommonDir(cwd), '..');
}

export function loadHookChange(root, event = {}, options = {}) {
  const currentRoot = hookRoot(root, event);
  const sessionId = hookSessionId(event);
  const activeOptions = {
    ...options,
    allowBoundWorktree: true,
    ...(sessionId ? { sessionId } : {}),
  };
  const active = loadActiveChange(currentRoot, activeOptions);
  if (!active.ok || !sessionId) return active;
  const heartbeat = heartbeatSessionLease(currentRoot, sessionId, {
    leaseMs: options.heartbeatLeaseMs,
    renewWithinMs: options.heartbeatWithinMs,
    now: options.now,
  });
  if (heartbeat.reason === 'expired') return loadActiveChange(currentRoot, activeOptions);
  return heartbeat.binding ? { ...active, binding: heartbeat.binding } : active;
}

export function hookChangeId(root, event = {}, options = {}) {
  const active = loadHookChange(root, event, options);
  return active.ok ? active.changeId : null;
}
