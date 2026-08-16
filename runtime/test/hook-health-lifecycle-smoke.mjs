import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindSession } from '../lib/sessions.mjs';
import { recordHookHealth } from '../lib/hook-health.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lifecycle = path.join(sourceRoot, 'runtime', 'lifecycle.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-hook-health-lifecycle-'));
const changeId = 'health-transition';
const otherChangeId = 'other-transition';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const otherChangeDir = path.join(root, 'harness', 'changes', otherChangeId);
const sessionId = 'health-session';

function invoke(change = changeId, extraEnv = {}) {
  return spawnSync(process.execPath, [lifecycle, 'state', change, 'plan'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: { ...process.env, ENTERPRISE_HARNESS_SESSION_ID: sessionId, ...extraEnv },
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(otherChangeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification: null },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(otherChangeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId: otherChangeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification: null },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  bindSession(root, {
    sessionId,
    changeId,
    worktreePath: root,
    controllerRevision: 'test-controller',
  }, { commonDir: path.join(root, '.git') });

  const missing = invoke();
  assert.equal(missing.status, 2);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /EH-HOOK-HEALTH-002/u);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /fresh hook health/u);

  recordHookHealth(root, { sessionId, now: Date.now(), ttlMs: 60_000 });
  const freshButIncomplete = invoke();
  assert.equal(freshButIncomplete.status, 2);
  assert.doesNotMatch(`${freshButIncomplete.stdout}\n${freshButIncomplete.stderr}`, /EH-HOOK-HEALTH-002/u);
  assert.match(`${freshButIncomplete.stdout}\n${freshButIncomplete.stderr}`, /fresh StageResult/u);

  const wrongChange = invoke(otherChangeId);
  assert.equal(wrongChange.status, 2);
  assert.match(`${wrongChange.stdout}\n${wrongChange.stderr}`, /session.*bound.*health-transition|session.*change.*mismatch|EH-SESSION/u);

  recordHookHealth(root, { sessionId, now: Date.now() - 120_000, ttlMs: 60_000 });
  const stale = invoke();
  assert.equal(stale.status, 2);
  assert.match(`${stale.stdout}\n${stale.stderr}`, /stale SessionStart hook-health receipt/u);

  const unbound = spawnSync(process.execPath, [lifecycle, 'state', changeId, 'plan'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: { ...process.env, ENTERPRISE_HARNESS_SESSION_ID: 'unbound-health-session' },
  });
  assert.equal(unbound.status, 2);
  assert.match(`${unbound.stdout}\n${unbound.stderr}`, /EH-SESSION-CHANGE-001/u);
  assert.match(`${unbound.stdout}\n${unbound.stderr}`, /missing-session-binding/u);

  console.log(`PASS hook-health-lifecycle ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
