import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bindSession, readSession } from '../lib/sessions.mjs';
import { loadHookChange } from '../lib/hook-change.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-hook-heartbeat-'));
const sessionId = 'live-hook-session';
const changeId = 'long-running-research';
try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  const statePath = path.join(root, 'harness', 'changes', changeId, 'state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify({ schemaVersion: 6, changeId, stage: 'clarify', lifecycle: 'active', currentTask: null })}\n`);
  const now = Date.now();
  bindSession(root, {
    sessionId, changeId, worktreePath: root, controllerRevision: 'test',
  }, { now, leaseMs: 60_000 });

  const active = loadHookChange(root, { cwd: root, session_id: sessionId }, {
    now: now + 1_000,
    heartbeatWithinMs: 120_000,
    heartbeatLeaseMs: 15 * 60 * 1000,
  });
  assert.equal(active.ok, true);
  assert.equal(readSession(root, sessionId).leaseExpiresAt, now + 1_000 + (15 * 60 * 1000));

  const sessionPath = path.join(root, '.git', 'enterprise-harness', 'sessions', `${sessionId}.json`);
  const binding = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  fs.writeFileSync(sessionPath, `${JSON.stringify({ ...binding, leaseExpiresAt: now - 1 })}\n`);
  const expired = loadHookChange(root, { cwd: root, session_id: sessionId }, {
    now,
    heartbeatWithinMs: 120_000,
    heartbeatLeaseMs: 15 * 60 * 1000,
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.reason, 'expired-session-lease');
  assert.equal(readSession(root, sessionId).leaseExpiresAt, now - 1, 'expired hook lease must remain expired');

  console.log('PASS hook-session-heartbeat smoke');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
