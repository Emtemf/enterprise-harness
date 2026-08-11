import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireChangeLock, readChangeLock, recoverStaleChangeLock } from '../lib/change-locks.mjs';
import { bindSession, unbindSession } from '../lib/sessions.mjs';
import { runtimePaths } from '../lib/runtime-paths.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-stale-lock-'));
try {
  bindSession(root, {
    sessionId: 'session-a',
    changeId: 'change-a',
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  });
  acquireChangeLock(root, 'change-a', 'session-a');
  const lockPath = path.join(root, '.git', 'enterprise-harness', 'locks', 'change-a.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  fs.writeFileSync(lockPath, JSON.stringify({ ...lock, acquiredAt: '2020-01-01T00:00:00.000Z' }));
  unbindSession(root, 'session-a');
  assert.equal(recoverStaleChangeLock(root, 'change-a', { staleAfterMs: 1, recoveryToken: lock.lockId }), true);
  assert.equal(readChangeLock(root, 'change-a'), null);
  assert.equal(recoverStaleChangeLock(root, 'change-a', { staleAfterMs: 1 }), false);
  const orphanGuard = `${runtimePaths(root).lockPath('change-b')}.guard`;
  fs.mkdirSync(orphanGuard, { recursive: true });
  fs.utimesSync(orphanGuard, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));
  assert.equal(recoverStaleChangeLock(root, 'change-b', { staleAfterMs: 1 }), true);
  console.log('PASS stale-change-lock recovery verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
