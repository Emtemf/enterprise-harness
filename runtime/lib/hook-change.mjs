import path from 'node:path';
import { gitCommonDir } from './agent-evidence.mjs';
import { loadActiveChange } from './gates.mjs';

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
  return loadActiveChange(currentRoot, {
    ...options,
    allowBoundWorktree: true,
    ...(sessionId ? { sessionId } : {}),
  });
}

export function hookChangeId(root, event = {}, options = {}) {
  const active = loadHookChange(root, event, options);
  return active.ok ? active.changeId : null;
}
