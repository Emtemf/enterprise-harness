import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildStageReadiness } from '../lib/stage-results.mjs';
import { buildWorkflowResult } from '../lib/workflow.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { writeCanonicalSingleTaskPlanFixture } from './plan-proof-fixture.mjs';
import { writeCanonicalVerifyCompletionFixture } from './verify-completion-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-stage-readiness-'));
const changeId = 'post-design-readiness';
const taskId = 'task-one';
try {
  writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'plan' });
  assert.equal(buildStageReadiness(root, changeId, 'plan').route, 'plan.produce');
  writeCanonicalSingleTaskPlanFixture(root, changeId, {
    taskId,
    tasksContent: '# Tasks\n\n## Task 1: task-one\n\n- Test cases: TC1\n- Strategy: `direct`\n- Minimal RED case: none\n',
    taskCommands: {
      schemaVersion: 4,
      tasks: {
        [taskId]: {
          executionStrategy: 'direct', strategyRationale: '标准样例只验证冻结路由',
          testCases: ['TC1'], minimalRedCase: null,
          writeScope: { allowed: ['fixture.txt'], forbidden: [] },
          commands: [{ phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'] }],
        },
      },
    },
  });
  assert.equal(buildStageReadiness(root, changeId, 'plan').route, 'plan.transition');
  const state = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), 'utf-8'));
  const workflow = buildWorkflowResult(root, changeId, state);
  assert.equal(workflow.stageReadiness.route, 'implement.execute-task');
  assert.equal(workflow.pendingDecision, null);
  assert.ok(['implement.execute-task', `workflow audit ${changeId} --json`].includes(workflow.nextAction));

  const verifyId = 'verify-readiness';
  writeCanonicalCompoundDesignFixture(root, verifyId, { stateStage: 'verify' });
  assert.equal(buildStageReadiness(root, verifyId, 'verify').route, 'verify.produce');
  writeCanonicalVerifyCompletionFixture(root, verifyId);
  const verifyReady = buildStageReadiness(root, verifyId, 'verify');
  assert.equal(verifyReady.route, 'verify.transition');
  assert.equal(verifyReady.transitionReady, true);
  console.log(`PASS post-design-stage-readiness ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
