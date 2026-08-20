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
  const validTasks = [
    '# Tasks',
    '',
    '## Task 1: task-1',
    '### Target and scope',
    '- Goal: change one file',
    '- Dependencies: `none`',
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
  ].join('\n');
  fs.writeFileSync(path.join(root, tasksRef), validTasks);
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
  const result = JSON.parse(passed.stdout);
  assert.equal(result.status, 'pass');
  assert.deepEqual(
    result.assertions.map((entry) => entry.id),
    ['task-shape', 'strategy-and-command-contract'],
    'Plan shape and execution contract must be first-class assertions',
  );

  fs.writeFileSync(path.join(root, tasksRef), '# Tasks\n\n## Task <task-id>\n');
  const rejected = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(rejected.status, 0, 'placeholder plan must not finalize');

  fs.writeFileSync(path.join(root, tasksRef), validTasks.replace('- Strategy: `direct`', '- Strategy: `unknown`'));
  const invalidStrategy = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(invalidStrategy.status, 0, 'unsupported execution strategy must not finalize');
  assert.match(invalidStrategy.stderr, /invalid execution strategy unknown/u);

  fs.writeFileSync(path.join(root, tasksRef), validTasks.replace('- Frozen primary argv: `node --test test.mjs`', '- Frozen primary argv:'));
  const missingArgv = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(missingArgv.status, 0, 'empty primary argv must not finalize');
  assert.match(missingArgv.stderr, /missing frozen primary argv/u);

  fs.writeFileSync(path.join(root, tasksRef), validTasks.replace('- Dependencies: `none`', '- Dependencies:'));
  const missingDependencies = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(missingDependencies.status, 0, 'implicit task ordering must not replace dependency evidence');
  assert.match(missingDependencies.stderr, /must declare dependencies or none/u);

  fs.writeFileSync(path.join(root, tasksRef), validTasks.replace('- Dependencies: `none`', '- Dependencies: `task-0`'));
  const unknownDependency = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(unknownDependency.status, 0, 'unknown dependency must not finalize');
  assert.match(unknownDependency.stderr, /references unknown dependency task-0/u);

  fs.writeFileSync(path.join(root, tasksRef), validTasks);
  fs.writeFileSync(path.join(root, designRef), '# Design changed\n');
  const staleInput = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(staleInput.status, 0, 'stale Plan input digest must not finalize');
  assert.match(staleInput.stderr, /handoff input digest is stale/u);

  console.log(`PASS plan-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
