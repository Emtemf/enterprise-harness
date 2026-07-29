import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lifecycle = path.join(runtimeRoot, 'lifecycle.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-task3-archive-'));
const changeId = 'incomplete-change';
const changeDir = path.join(root, 'harness/changes', changeId);
try {
  fs.mkdirSync(changeDir, { recursive: true });
  const state = { schemaVersion: 3, changeId, tier: 'L1', state: 'VALIDATED', impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' }, workflow: { stage: 'archive' }, validation: { status: 'stale', digest: null, validatedAt: null } };
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), `${changeId}\n`);
  const before = fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8');
  const result = spawnSync(process.execPath, [lifecycle, 'archive', changeId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 2);
  assert.equal(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'), before, 'failed archive must not mutate state');
  assert.equal(fs.existsSync(path.join(root, 'harness/archive', changeId)), false, 'failed archive must not move the directory');
  assert.equal(fs.readFileSync(path.join(root, 'harness/ACTIVE_CHANGE'), 'utf-8'), `${changeId}\n`, 'failed archive must not clear ACTIVE_CHANGE');
  console.log('PASS archive-completion verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
