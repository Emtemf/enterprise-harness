// workflow audit 必须同时验证 state、artifact、execute result、独立 checker result 与 parent linkage。
// 不能只因为 state.json 已到 archive 就放行。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { auditWorkflow } from '../lib/workflow-audit.mjs';
import { createHandoffInput, persistHandoffResult } from '../lib/handoff.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/workflow-audit-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-audit-'));
const changeId = 'audit-smoke';
const changeDir = path.join(root, 'harness', 'changes', changeId);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function resultFor(input, verdict = undefined) {
  return {
    handoffVersion: 1,
    runId: input.runId,
    changeId: input.changeId,
    stage: input.stage,
    behavior: input.behavior,
    role: input.role,
    agent: input.agent,
    tecpc: {
      target: input.tecpc.target || input.behavior,
      evidence: ['real-command --verify'],
      context: ['harness/changes/audit-smoke/state.json'],
      path: 'isolated handoff run',
      correction: 'return EH-* blocker when evidence fails',
    },
    outputRefs: [`harness/changes/${changeId}/state.json`],
    blockers: [],
    summary: `${input.behavior} completed`,
    ...(verdict ? { verdict } : {}),
  };
}

function completeBehavior(behavior, stage) {
  const execute = createHandoffInput(root, {
    changeId,
    stage,
    behavior,
    role: 'execute',
    target: `complete ${behavior}`,
  }).envelope;
  persistHandoffResult(root, execute, resultFor(execute));
  const check = createHandoffInput(root, {
    changeId,
    stage,
    behavior,
    role: 'check',
    parentRunId: execute.runId,
    target: `check ${behavior}`,
  }).envelope;
  persistHandoffResult(root, check, resultFor(check, 'pass'));
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'harness', 'specs'), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'harness', 'behavior-checks.json'), path.join(root, 'harness', 'behavior-checks.json'));
  for (const file of ['requirements.md', 'change.md', 'design.md', 'tasks.md', 'task-commands.json', 'validation.md']) {
    fs.writeFileSync(path.join(changeDir, file), '# Evidence\n', 'utf-8');
  }
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  for (const reviewer of ['design-reviewer', 'plan-critic']) {
    fs.writeFileSync(path.join(changeDir, 'reviews', `${reviewer}.json`), JSON.stringify({ reviewerId: reviewer, verdict: 'pass' }), 'utf-8');
  }
  const state = {
    schemaVersion: 4,
    changeId,
    state: 'VALIDATED',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    gates: { designApproved: true },
    currentTask: 'task-1',
    workflow: {
      stage: 'archive',
      clarifyReady: true,
      userConfirmedScope: true,
      routeReady: true,
      planReady: true,
      tddStatus: 'refactor-verified',
    },
    validation: { status: 'fresh', digest: 'abc123' },
  };
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');

  const required = [
    ['clarify.synthesize', 'clarify'],
    ['route.decide', 'route'],
    ['design.produce', 'design'],
    ['plan.produce', 'plan'],
    ['tdd.execute-task', 'tdd'],
    ['verify.collect', 'verify'],
  ];
  required.forEach(([behavior, stage]) => completeBehavior(behavior, stage));

  const complete = auditWorkflow(root, changeId, state);
  if (complete.verdict !== 'pass') {
    fail(`Expected complete evidence graph to pass, got ${complete.verdict}: ${JSON.stringify(complete.blockers)}`);
  }

  // 普通 audit 不要求当前 working stage 已结束；但 completion audit 必须要求。
  const verifyState = { ...state, workflow: { ...state.workflow, stage: 'verify' } };
  const currentOnly = auditWorkflow(root, changeId, verifyState);
  if (currentOnly.verdict !== 'pass') {
    fail(`Expected ordinary verify-stage audit to ignore current stage, got ${currentOnly.verdict}`);
  }
  const completionAudit = auditWorkflow(root, changeId, verifyState, { includeCurrent: true });
  if (completionAudit.verdict !== 'pass') {
    fail(`Expected completion audit to include and pass verify evidence, got ${completionAudit.verdict}`);
  }
  const verifyRun = completionAudit.stages.find((stage) => stage.stage === 'verify')?.handoffs
    .find((handoff) => handoff.behavior === 'verify.collect')?.executions[0];
  if (!verifyRun) fail('Could not locate completed verify executor run');
  fs.rmSync(path.join(changeDir, 'runs', verifyRun, 'result.json'));
  const missingCurrentVerify = auditWorkflow(root, changeId, verifyState, { includeCurrent: true });
  if (missingCurrentVerify.verdict !== 'block') {
    fail('Expected completion audit to block when current verify evidence is missing');
  }
  persistHandoffResult(root, JSON.parse(fs.readFileSync(path.join(changeDir, 'runs', verifyRun, 'input.json'), 'utf-8')),
    resultFor(JSON.parse(fs.readFileSync(path.join(changeDir, 'runs', verifyRun, 'input.json'), 'utf-8'))));

  // 删除一个 executor result：artifact/state 都还在，audit 仍必须拒绝。
  const tddStage = complete.stages.find((stage) => stage.stage === 'tdd');
  const runId = tddStage?.handoffs.find((handoff) => handoff.behavior === 'tdd.execute-task')?.executions[0];
  if (!runId) fail('Could not locate completed tdd executor run');
  fs.rmSync(path.join(changeDir, 'runs', runId, 'result.json'));
  const incomplete = auditWorkflow(root, changeId, state);
  const codes = incomplete.blockers.map((item) => item.code);
  if (incomplete.verdict !== 'block' || !codes.includes('EH-AUDIT-HANDOFF-001')) {
    fail(`Expected missing executor result to block audit, got ${incomplete.verdict}: ${JSON.stringify(incomplete.blockers)}`);
  }

  if (process.exitCode !== 1) console.log('Workflow audit smoke passed (complete PASS, missing result BLOCK).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
