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
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, designRef), '# Design\n');
  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n');
  fs.mkdirSync(path.dirname(path.join(root, designProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, designProofRef), JSON.stringify({ type: 'completion-proof', stage: 'design' }));
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({ schemaVersion: 6, lifecycle: 'active', stage: 'plan' }));
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks',
    '',
    '## Task 1: task-1',
    '### Target and scope',
    '- Goal: change one file',
    '### Frozen inputs',
    '- Consumes: design.md',
    '- Test cases: TC1',
    '### Execution strategy',
    '- Strategy: `direct`',
    '### Commands and verification',
    '- Frozen primary argv: `node --test test.mjs`',
    '- Acceptance checks: tests pass',
    '- Recovery/rollback: revert the change',
    '### Independent review',
    '- Applicable rubrics: task',
  ].join('\n'));
  const missingTestCases = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [designRef, designProofRef],
    tecpc: { target: 'plan slice missing test cases', evidence: [designRef], context: [designRef, designProofRef], path: tasksRef, correction: null },
  });
  const missing = spawnSync(process.execPath, [finalize, changeId, missingTestCases.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(missing.status, 0, 'plan must reject a handoff without test-cases.md');
  assert.match(missing.stderr, /test-cases input must be digest-bound/u);

  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [designRef, testCasesRef, designProofRef],
    tecpc: { target: 'plan slice', evidence: [designRef], context: [designRef, testCasesRef, designProofRef], path: tasksRef, correction: null },
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
