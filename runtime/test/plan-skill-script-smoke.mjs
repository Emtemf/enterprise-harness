import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2 } from '../core/handoff-v2.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalize = path.join(sourceRoot, 'skills', 'plan', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-plan-skill-'));
const changeId = 'plan-slice';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const designRef = `harness/changes/${changeId}/design.md`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, designRef), '# Design\n');
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks',
    '',
    '## Task 1: task-1',
    '### Target and scope',
    '- Goal: change one file',
    '### Frozen inputs',
    '- Consumes: design.md',
    '### Execution strategy',
    '- Strategy: `direct`',
    '### Commands and verification',
    '- Frozen primary argv: `node --test test.mjs`',
    '- Acceptance checks: tests pass',
    '- Recovery/rollback: revert the change',
    '### Independent review',
    '- Applicable rubrics: task',
  ].join('\n'));
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [designRef],
    tecpc: { target: 'plan slice', evidence: [designRef], context: [designRef], path: tasksRef, correction: null },
  });
  const passed = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).status, 'pass');

  fs.writeFileSync(path.join(root, tasksRef), '# Tasks\n\n## Task <task-id>\n');
  const rejected = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(rejected.status, 0, 'placeholder plan must not finalize');

  console.log(`PASS plan-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
