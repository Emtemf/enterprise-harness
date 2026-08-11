import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimePaths } from '../lib/runtime-paths.mjs';
import { bindSession, readSession, listSessions } from '../lib/sessions.mjs';
import { acquireChangeLock, releaseChangeLock } from '../lib/change-locks.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-concurrency-'));
try {
  const paths = runtimePaths(root, { commonDir: path.join(root, '.git') });
  assert.equal(paths.sessionDir, path.join(root, '.git', 'enterprise-harness', 'sessions'));
  const first = bindSession(root, {
    sessionId: 'session-a',
    changeId: 'change-a',
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  });
  assert.equal(first.changeId, 'change-a');
  assert.deepEqual(readSession(root, 'session-a'), first);
  bindSession(root, {
    sessionId: 'session-b',
    changeId: 'change-b',
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  });
  assert.equal(listSessions(root).length, 2);
  assert.throws(
    () => bindSession(root, {
      sessionId: 'session-a',
      changeId: 'change-b',
      worktreePath: root,
      controllerRevision: '0.4.0-dev',
    }),
    /EH-SESSION-CONFLICT-001/u,
  );

  const lock = acquireChangeLock(root, 'change-a', 'session-a');
  assert.equal(lock.changeId, 'change-a');
  assert.throws(
    () => acquireChangeLock(root, 'change-a', 'session-b'),
    /EH-CHANGE-LOCK-001/u,
  );
  releaseChangeLock(root, 'change-a', 'session-a');
  assert.equal(fs.existsSync(paths.lockPath('change-a')), false);
  console.log('PASS session-concurrency verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
