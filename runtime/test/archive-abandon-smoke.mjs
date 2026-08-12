import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindSession, listSessions } from '../lib/sessions.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-abandon-'));
try {
  fs.mkdirSync(path.join(root, 'harness', 'changes', 'unfinished'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'changes', 'unfinished', 'state.json'), JSON.stringify({
    schemaVersion: 5,
    changeId: 'unfinished',
    state: 'DRAFT',
    lifecycle: 'active',
  }));
  fs.writeFileSync(path.join(root, 'harness', 'changes', 'unfinished', 'requirements.md'), '# Requirements\n');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'unfinished\n');
  bindSession(root, {
    sessionId: 'abandon-session',
    changeId: 'unfinished',
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  });
  const result = spawnSync('node', [path.join(repoRoot, 'runtime', 'lifecycle.mjs'), 'abandon', 'unfinished', 'scope replaced by a smaller change'], { cwd: root, encoding: 'utf-8' });
  assert.equal(result.status, 0, result.stderr);
  const archived = fs.readdirSync(path.join(root, 'harness', 'archive'));
  assert.equal(archived.length, 1);
  const abandoned = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'archive', archived[0], 'state.json'), 'utf-8'));
  assert.equal(abandoned.state, 'ABANDONED');
  assert.equal(abandoned.lifecycle, 'abandoned');
  assert.equal(abandoned.abandonReason, 'scope replaced by a smaller change');
  assert.equal(fs.existsSync(path.join(root, 'harness', 'ACTIVE_CHANGE')), false);
  assert.equal(listSessions(root).length, 0);
  console.log('PASS archive-abandon verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
