import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalize = path.join(sourceRoot, 'skills', 'plan', 'scripts', 'finalize-result.mjs');
const prepare = path.join(sourceRoot, 'skills', 'plan', 'scripts', 'prepare-input.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-plan-skill-'));
const changeId = 'plan-slice';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const designRef = `harness/changes/${changeId}/design.md`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
const tasksRef = `harness/changes/${changeId}/tasks.md`;
const taskCommandsRef = `harness/changes/${changeId}/task-commands.json`;

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, designRef), '# Design\n');
  fs.writeFileSync(path.join(root, testCasesRef), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable result | cleanup | accepted |',
  ].join('\n'));
  fs.mkdirSync(path.dirname(path.join(root, designProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, designProofRef), JSON.stringify({ type: 'completion-proof', stage: 'design' }));
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({ schemaVersion: 6, lifecycle: 'active', stage: 'plan' }));
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks',
    '',
    'Status: finalized-plan',
    '',
    '## Task 1: task-1',
    '### Target and scope',
    '- Goal: change one file',
    '- Modify: src/example.js',
    '- Create: N/A — no new file',
    '- Test: test.mjs',
    '- Out of scope: unrelated files',
    '### Frozen inputs',
    '- Consumes: design.md',
    '- Input digests: frozen by handoff',
    '- Design decisions/requirements: R1 / D1',
    '- Test cases: TC1',
    '### Execution strategy',
    '- Strategy: `direct`',
    '- Minimal RED case: N/A — direct strategy',
    '- Why this strategy fits: deterministic verification is sufficient',
    '- Strategy-specific precondition and receipt:',
    '  - `direct`: record VERIFY receipt',
    '### Commands and verification',
    '- Frozen primary argv: `node --test test.mjs`',
    '- Expected result: exit 0',
    '- Acceptance checks: tests pass',
    '- Recovery/rollback: revert the change',
    '### Independent review',
    '- Applicable rubrics: task',
    '- Reviewer input artifacts: tasks.md and task-commands.json',
    '- Review completion condition: independent pass',
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

  writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'plan' });

  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [designRef, testCasesRef, designProofRef],
    tecpc: { target: 'plan slice', evidence: [designRef], context: [designRef, testCasesRef, designProofRef], path: tasksRef, correction: null },
  });
  const prepared = spawnSync(process.execPath, [prepare, `HANDOFF_INPUT=${handoff.path}`], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(prepared.status, 0, prepared.stderr);
  const missingTaskCommands = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(missingTaskCommands.status, 0, 'Plan must not finalize without canonical task-commands.json');
  assert.match(missingTaskCommands.stderr, /task-commands\.json/u);

  fs.writeFileSync(path.join(root, taskCommandsRef), `${JSON.stringify({
    schemaVersion: 4,
    tasks: {
      'task-1': {
        executionStrategy: 'direct',
        strategyRationale: 'This fixture needs only deterministic verification.',
        testCases: ['TC1'],
        minimalRedCase: null,
        writeScope: { allowed: ['src/example.js'], forbidden: [] },
        commands: [{ phase: 'VERIFY', argv: ['node', '--test', 'test.mjs'] }],
      },
    },
  }, null, 2)}\n`);
  const passed = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(passed.status, 0, passed.stderr);
  const passedResult = JSON.parse(passed.stdout);
  assert.equal(passedResult.status, 'pass');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, handoff.runId), 'utf-8')),
    passedResult,
    'Plan finalizer must atomically persist the same StageResult it prints',
  );
  assert.deepEqual(
    passedResult.artifacts.map(({ path: artifactPath }) => artifactPath),
    [tasksRef, taskCommandsRef],
    'one Plan StageResult must bind both human and machine plan artifacts',
  );
  const duplicate = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(duplicate.status, 0, 'Plan result persistence must be immutable');
  assert.match(duplicate.stderr, /durable result already exists/u);

  const validTaskCommands = fs.readFileSync(path.join(root, taskCommandsRef), 'utf-8');
  const unsafeTaskCommands = JSON.parse(validTaskCommands);
  unsafeTaskCommands.tasks['task-1'].writeScope.allowed = ['../outside.js'];
  unsafeTaskCommands.tasks['task-1'].commands[0].argv = [];
  fs.writeFileSync(path.join(root, taskCommandsRef), `${JSON.stringify(unsafeTaskCommands, null, 2)}\n`);
  const unsafeCommands = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [designRef, testCasesRef, designProofRef],
    tecpc: { target: 'plan unsafe task commands', evidence: [designRef], context: [designRef, testCasesRef, designProofRef], path: taskCommandsRef, correction: null },
  });
  const unsafeRejected = spawnSync(process.execPath, [finalize, changeId, unsafeCommands.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(unsafeRejected.status, 0, 'Plan must reject unsafe write scope and empty argv');
  assert.match(unsafeRejected.stderr, /writeScope\.allowed|argv/u);
  fs.writeFileSync(path.join(root, taskCommandsRef), validTaskCommands);

  // Adversarial RED: a valid-looking task may not invent a TC ID or put its
  // TDD RED case outside the task's own mapping.  The runtime, not the Skill
  // prose, owns this association.
  fs.writeFileSync(path.join(root, tasksRef), [
    '# Tasks',
    '',
    'Status: finalized-plan',
    '',
    '## Task 1: task-1',
    '### Target and scope',
    '- Goal: change one file',
    '- Modify: src/example.js',
    '- Create: N/A — no new file',
    '- Test: test.mjs',
    '- Out of scope: unrelated files',
    '### Frozen inputs',
    '- Consumes: design.md',
    '- Input digests: frozen by handoff',
    '- Design decisions/requirements: R1 / D1',
    '- Test cases: TC999',
    '### Execution strategy',
    '- Strategy: `tdd`',
    '- Minimal RED case: TC998',
    '- Why this strategy fits: focused behavior requires RED',
    '- Strategy-specific precondition and receipt:',
    '  - `tdd`: observe RED before GREEN',
    '### Commands and verification',
    '- Frozen primary argv: `node --test test.mjs`',
    '- Expected result: exit 0 after GREEN',
    '- Acceptance checks: tests pass',
    '- Recovery/rollback: revert the change',
    '### Independent review',
    '- Applicable rubrics: task',
    '- Reviewer input artifacts: tasks.md and task-commands.json',
    '- Review completion condition: independent pass',
  ].join('\n'));
  const unknownCases = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [designRef, testCasesRef, designProofRef],
    tecpc: { target: 'plan unknown test case', evidence: [designRef], context: [designRef, testCasesRef, designProofRef], path: tasksRef, correction: null },
  });
  const unknownRejected = spawnSync(process.execPath, [finalize, changeId, unknownCases.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(unknownRejected.status, 0, 'Plan must reject unknown task TC IDs and a RED case outside its mapping');
  assert.match(unknownRejected.stderr, /TC999|TC998/u);

  fs.writeFileSync(path.join(root, tasksRef), '# Tasks\n\n## Task <task-id>\n');
  const placeholderHandoff = createHandoffV2(root, {
    changeId,
    stage: 'plan',
    behavior: 'plan.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'plan' },
    inputRefs: [designRef, testCasesRef, designProofRef],
    tecpc: { target: 'reject placeholder plan', evidence: [designRef], context: [designRef, testCasesRef, designProofRef], path: tasksRef, correction: null },
  });
  const rejected = spawnSync(process.execPath, [finalize, changeId, placeholderHandoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(rejected.status, 0, 'placeholder plan must not finalize');
  assert.match(rejected.stderr, /placeholder|Status/u);

  console.log(`PASS plan-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
