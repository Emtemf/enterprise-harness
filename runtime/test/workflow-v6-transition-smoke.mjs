import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateV6State } from '../core/change-state.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { applyV6ScopeConfirmationDecision, applyV6PlanReadinessDecision, applyV6ImplementCompletionDecision, applyV6VerifyCompletionDecision, inferPendingDecision } from '../lib/workflow.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const initial = Object.freeze({
  schemaVersion: 6,
  revision: 1,
  changeId: 'v6-transition-probe',
  lifecycle: 'active',
  stage: 'clarify',
  currentTask: null,
  artifacts: Object.freeze({
    classification: Object.freeze({
      path: 'harness/changes/v6-transition-probe/classification.json',
      digest: 'a'.repeat(64),
    }),
  }),
  blocker: null,
  validation: Object.freeze({ status: 'missing', digest: null, validatedAt: null }),
});
assert.deepEqual(validateV6State(initial, initial.changeId), []);

assert.throws(
  () => applyV6ScopeConfirmationDecision(initial, 'confirm-scope', {
    stageProblems: ['ReviewResult is missing'],
  }),
  /EH-WORKFLOW-STAGE-GATE-007.*ReviewResult is missing/u,
  'v6 confirm-scope must fail closed until the Clarify result gate passes',
);

assert.throws(
  () => applyV6ScopeConfirmationDecision(initial, 'confirm-scope', { stageProblems: [] }),
  /EH-WORKFLOW-STAGE-GATE-007.*lifecycle state command/u,
  'v6 confirm-scope must not bypass the canonical proof-persisting lifecycle transition',
);
assert.equal(initial.stage, 'clarify');

const revised = applyV6ScopeConfirmationDecision(initial, 'revise-scope', {
  stageProblems: [],
});
assert.equal(revised.stage, 'clarify');
assert.ok(!Object.hasOwn(revised, 'workflow'));
assert.deepEqual(validateV6State(revised, revised.changeId), []);

const planRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v6-plan-ready-'));
try {
  const planChangeId = 'v6-plan-ready-probe';
  fs.mkdirSync(path.join(planRoot, 'harness', 'changes', planChangeId), { recursive: true });
  fs.writeFileSync(path.join(planRoot, 'harness', 'changes', planChangeId, 'tasks.md'), '# Tasks\n\n## Task 1: task-1\n');
  const planData = {
    schemaVersion: 6,
    revision: 1,
    changeId: planChangeId,
    lifecycle: 'active',
    stage: 'plan',
    currentTask: 'task-1',
    artifacts: {
      classification: {
        path: `harness/changes/${planChangeId}/classification.json`,
        digest: 'b'.repeat(64),
      },
    },
    blocker: null,
    validation: { status: 'missing', digest: null, validatedAt: null },
  };
  assert.deepEqual(validateV6State(planData, planChangeId), []);
  assert.deepEqual(
    inferPendingDecision(
      planChangeId,
      planData,
      'plan',
      'plan 已完成，下一步应进入 implement。',
      () => false,
      { stageGateProblems: [] },
    ),
    {
      kind: 'plan-readiness',
      message: 'plan 已完成，下一步应进入 implement。',
      options: ['freeze-plan', 'revise-plan'],
      defaultDecision: 'freeze-plan',
      evidence: [`harness/changes/${planChangeId}/tasks.md`],
    },
  );
  assert.throws(
    () => applyV6PlanReadinessDecision(planData, 'freeze-plan', {
      stageProblems: ['ReviewResult is missing'],
    }),
    /EH-WORKFLOW-STAGE-GATE-009.*ReviewResult is missing/u,
  );
  const implementing = applyV6PlanReadinessDecision(planData, 'freeze-plan', { stageProblems: [] });
  assert.equal(implementing.stage, 'implement');
  assert.equal(implementing.currentTask, 'task-1');
  assert.ok(!Object.hasOwn(implementing, 'workflow'));
  assert.deepEqual(validateV6State(implementing, planChangeId), []);
} finally {
  fs.rmSync(planRoot, { recursive: true, force: true });
}

const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v6-cli-state-'));
try {
  const changeId = 'v6-cli-state-probe';
  const changeDir = path.join(cliRoot, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: cliRoot, shell: false });
  const classification = writeClassificationArtifact(cliRoot, changeId, {
    tier: 'L1',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    requiredReviews: ['requirements'],
  });
  const cliState = {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    currentTask: null,
    artifacts: { classification },
    blocker: null,
    validation: { status: 'missing', digest: null, validatedAt: null },
  };
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify(cliState, null, 2)}\n`);
  const cli = spawnSync(process.execPath, [path.join(root, 'runtime', 'workflow.mjs'), 'run', changeId], {
    cwd: cliRoot,
    encoding: 'utf-8',
    shell: false,
    env: (() => {
      const env = { ...process.env };
      delete env.ENTERPRISE_HARNESS_SESSION_ID;
      delete env.CLAUDE_SESSION_ID;
      return env;
    })(),
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const persisted = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  assert.ok(!Object.hasOwn(persisted, 'workflow'), 'v6 CLI persistence must not reintroduce workflow projections');
  assert.deepEqual(validateV6State(persisted, changeId), []);
} finally {
  fs.rmSync(cliRoot, { recursive: true, force: true });
}

const implementData = {
  schemaVersion: 6,
  revision: 1,
  changeId: 'v6-implement-completion-probe',
  lifecycle: 'active',
  stage: 'implement',
  currentTask: 'task-1',
  artifacts: {
    classification: {
      path: 'harness/changes/v6-implement-completion-probe/classification.json',
      digest: 'c'.repeat(64),
    },
  },
  blocker: null,
  validation: { status: 'fresh', digest: 'd'.repeat(64), validatedAt: '2026-08-18T00:00:00.000Z' },
};
assert.deepEqual(validateV6State(implementData, implementData.changeId), []);
assert.throws(
  () => applyV6ImplementCompletionDecision(implementData, 'enter-verify', {
    stageProblems: ['ReviewResult is missing'],
  }),
  /EH-WORKFLOW-STAGE-GATE-010.*ReviewResult is missing/u,
);
const verifying = applyV6ImplementCompletionDecision(implementData, 'enter-verify', { stageProblems: [] });
assert.equal(verifying.stage, 'verify');
assert.deepEqual(verifying.validation, { status: 'stale', digest: null, validatedAt: null });
assert.ok(!Object.hasOwn(verifying, 'workflow'));
assert.deepEqual(validateV6State(verifying, verifying.changeId), []);
assert.deepEqual(
  inferPendingDecision(
    implementData.changeId,
    { ...implementData, validation: { status: 'missing', digest: null, validatedAt: null } },
    'implement',
    'implement 已完成，下一步应进入 verify。',
    () => false,
    { stageGateProblems: [] },
  ),
  {
    kind: 'implement-completion',
    message: 'implement 已完成，下一步应进入 verify。',
    options: ['enter-verify', 'revise-task'],
    defaultDecision: 'enter-verify',
    evidence: [`harness/changes/${implementData.changeId}/evidence`],
  },
);

const verifyData = {
  ...verifying,
  stage: 'verify',
  validation: { status: 'fresh', digest: 'e'.repeat(64), validatedAt: '2026-08-18T01:00:00.000Z' },
};
assert.throws(
  () => applyV6VerifyCompletionDecision(verifyData, 'enter-archive', {
    stageProblems: ['ReviewResult is missing'],
  }),
  /EH-WORKFLOW-STAGE-GATE-011.*ReviewResult is missing/u,
);
const archiving = applyV6VerifyCompletionDecision(verifyData, 'enter-archive', { stageProblems: [] });
assert.equal(archiving.stage, 'archive');
assert.equal(archiving.validation.status, 'fresh');
assert.ok(!Object.hasOwn(archiving, 'workflow'));
assert.deepEqual(validateV6State(archiving, archiving.changeId), []);
const revisedVerification = applyV6VerifyCompletionDecision(verifyData, 'revise-verification', { stageProblems: [] });
assert.equal(revisedVerification.stage, 'verify');
assert.deepEqual(revisedVerification.validation, { status: 'stale', digest: null, validatedAt: null });
assert.deepEqual(validateV6State(revisedVerification, revisedVerification.changeId), []);

console.log(`PASS workflow-v6-transition ${mode}`);
