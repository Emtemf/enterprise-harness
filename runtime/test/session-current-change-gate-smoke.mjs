import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bindSession } from '../lib/sessions.mjs';
import { loadActiveChange } from '../lib/gates.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-session-gate-'));
const commonDir = path.join(root, '.git');
const changesDir = path.join(root, 'harness', 'changes');
const state = (changeId) => ({ schemaVersion: 5, changeId, state: 'DRAFT' });
try {
  fs.mkdirSync(path.join(changesDir, 'change-a'), { recursive: true });
  fs.mkdirSync(path.join(changesDir, 'change-b'), { recursive: true });
  fs.writeFileSync(path.join(changesDir, 'change-a', 'state.json'), JSON.stringify(state('change-a')));
  fs.writeFileSync(path.join(changesDir, 'change-b', 'state.json'), JSON.stringify(state('change-b')));
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'change-a\n');

  bindSession(root, {
    sessionId: 'session-b',
    changeId: 'change-b',
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  }, { commonDir });
  bindSession(root, {
    sessionId: 'session-other-root',
    changeId: 'change-a',
    worktreePath: path.join(root, 'other-worktree'),
    controllerRevision: '0.4.0-dev',
  }, { commonDir });
  const previous = process.env.ENTERPRISE_HARNESS_SESSION_ID;
  delete process.env.ENTERPRISE_HARNESS_SESSION_ID;
  try {
    const bound = loadActiveChange(root, {
      commonDir,
      env: {},
      sessionId: 'session-b',
    });
    assert.equal(bound.ok, true);
    assert.equal(bound.changeId, 'change-b');
  } finally {
    if (previous === undefined) delete process.env.ENTERPRISE_HARNESS_SESSION_ID;
    else process.env.ENTERPRISE_HARNESS_SESSION_ID = previous;
  }

  process.env.ENTERPRISE_HARNESS_SESSION_ID = 'session-b';
  try {
    const envBound = loadActiveChange(root, { commonDir });
    assert.equal(envBound.ok, true);
    assert.equal(envBound.changeId, 'change-b');
  } finally {
    if (previous === undefined) delete process.env.ENTERPRISE_HARNESS_SESSION_ID;
    else process.env.ENTERPRISE_HARNESS_SESSION_ID = previous;
  }

  process.env.ENTERPRISE_HARNESS_SESSION_ID = 'session-other-root';
  try {
    const mismatch = loadActiveChange(root, { commonDir });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.errorCode, 'EH-SESSION-WORKTREE-001');
  } finally {
    if (previous === undefined) delete process.env.ENTERPRISE_HARNESS_SESSION_ID;
    else process.env.ENTERPRISE_HARNESS_SESSION_ID = previous;
  }

  const legacy = loadActiveChange(root, { commonDir });
  assert.equal(legacy.changeId, 'change-a');

  process.env.ENTERPRISE_HARNESS_SESSION_ID = 'missing-session';
  try {
    const missing = loadActiveChange(root, { commonDir });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing-session-binding');
  } finally {
    if (previous === undefined) delete process.env.ENTERPRISE_HARNESS_SESSION_ID;
    else process.env.ENTERPRISE_HARNESS_SESSION_ID = previous;
  }
  console.log('PASS session-current-change-gate verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
