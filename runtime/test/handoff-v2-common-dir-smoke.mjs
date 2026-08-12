import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHandoffV2, loadHandoffV2, v2InputPath } from '../core/handoff-v2.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-handoff-v2-'));
try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', 'handoff-v2'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'changes', 'handoff-v2', 'requirements.md'), '# Requirements\n', 'utf-8');

  const created = createHandoffV2(root, {
    changeId: 'handoff-v2',
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: ['harness/changes/handoff-v2/requirements.md'],
    tecpc: { target: 'map the target project', path: 'runtime/' },
  });
  assert.match(created.path, /\.git\/enterprise-harness\/runs\/handoff-v2\/run_/u);
  assert.equal(fs.existsSync(path.join(root, 'harness', 'changes', 'handoff-v2', 'runs')), false, 'v2 must not create subject-local runs');
  assert.equal(v2InputPath(root, 'handoff-v2', created.runId), created.path);
  const loaded = loadHandoffV2(root, 'handoff-v2', created.runId);
  assert.equal(loaded.handoffVersion, 2);
  assert.equal(loaded.inputRefs[0], 'harness/changes/handoff-v2/requirements.md');
  assert.ok(loaded.inputDigests[loaded.inputRefs[0]]);

  console.log('PASS handoff-v2-common-dir verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
