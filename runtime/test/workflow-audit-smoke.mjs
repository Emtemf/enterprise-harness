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
    changeId, stage, behavior, role: 'execute', target: `complete ${behavior}`,
  }).envelope;
  persistHandoffResult(root, execute, resultFor(execute));
  const check = createHandoffInput(root, {
    changeId, stage, behavior, role: 'check', parentRunId: execute.runId, target: `check ${behavior}`,
  }).envelope;
  persistHandoffResult(root, check, resultFor(check, 'pass'));
}

function runDir(runId) {
  return path.join(changeDir, 'runs', runId);
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
      stage: 'archive', clarifyReady: true, userConfirmedScope: true,
      routeReady: true, planReady: true, tddStatus: 'refactor-verified',
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

  // 伪造 checker 为 executor 身份，即便 result 与 input 自洽，也必须被 registry 校验拒绝。
  const routeCheck = complete.stages.find((stage) => stage.stage === 'route')?.handoffs
    .find((handoff) => handoff.behavior === 'route.decide')?.checks[0];
  if (!routeCheck) fail('Could not locate completed route checker run');
  const routeCheckInputPath = path.join(runDir(routeCheck.runId), 'input.json');
  const routeCheckResultPath = path.join(runDir(routeCheck.runId), 'check.json');
  const originalCheckInput = JSON.parse(fs.readFileSync(routeCheckInputPath, 'utf-8'));
  const originalCheckResult = JSON.parse(fs.readFileSync(routeCheckResultPath, 'utf-8'));
  const forgedInput = { ...originalCheckInput, agent: { type: 'enterprise-harness:route-decider', skill: 'invalid-skill' } };
  const forgedResult = { ...originalCheckResult, agent: forgedInput.agent };
  fs.writeFileSync(routeCheckInputPath, JSON.stringify(forgedInput, null, 2), 'utf-8');
  fs.writeFileSync(routeCheckResultPath, JSON.stringify(forgedResult, null, 2), 'utf-8');
  const forgedAudit = auditWorkflow(root, changeId, state);
  if (forgedAudit.verdict !== 'block' || !forgedAudit.blockers.some((item) => item.code === 'EH-AUDIT-HANDOFF-002')) {
    fail(`Expected forged checker identity to block audit, got ${forgedAudit.verdict}: ${JSON.stringify(forgedAudit.blockers)}`);
  }
  fs.writeFileSync(routeCheckInputPath, JSON.stringify(originalCheckInput, null, 2), 'utf-8');
  fs.writeFileSync(routeCheckResultPath, JSON.stringify(originalCheckResult, null, 2), 'utf-8');

  // 不能把未知 stage 视作所有阶段都尚未开始，然后错误返回 PASS。
  const invalidStageAudit = auditWorkflow(root, changeId, { ...state, workflow: { ...state.workflow, stage: 'bogus' } });
  if (invalidStageAudit.verdict !== 'block' || !invalidStageAudit.blockers.some((item) => item.code === 'EH-AUDIT-STATE-005')) {
    fail(`Expected invalid workflow stage to block audit, got ${invalidStageAudit.verdict}: ${JSON.stringify(invalidStageAudit.blockers)}`);
  }

  // 普通 audit 不要求当前 working stage 已结束；completion audit 必须要求。
  const verifyState = { ...state, workflow: { ...state.workflow, stage: 'verify' } };
  const currentOnly = auditWorkflow(root, changeId, verifyState);
  if (currentOnly.verdict !== 'pass') fail(`Expected ordinary verify-stage audit to ignore current stage, got ${currentOnly.verdict}`);
  const completionAudit = auditWorkflow(root, changeId, verifyState, { includeCurrent: true });
  if (completionAudit.verdict !== 'pass') fail(`Expected completion audit to include and pass verify evidence, got ${completionAudit.verdict}`);
  const verifyRun = completionAudit.stages.find((stage) => stage.stage === 'verify')?.handoffs
    .find((handoff) => handoff.behavior === 'verify.collect')?.executions[0];
  if (!verifyRun) fail('Could not locate completed verify executor run');
  fs.rmSync(path.join(runDir(verifyRun), 'result.json'));
  const missingCurrentVerify = auditWorkflow(root, changeId, verifyState, { includeCurrent: true });
  if (missingCurrentVerify.verdict !== 'block') fail('Expected completion audit to block when current verify evidence is missing');
  const verifyInput = JSON.parse(fs.readFileSync(path.join(runDir(verifyRun), 'input.json'), 'utf-8'));
  persistHandoffResult(root, verifyInput, resultFor(verifyInput));

  // 删除一个 executor result：artifact/state 都还在，audit 仍必须拒绝。
  const tddRun = complete.stages.find((stage) => stage.stage === 'tdd')?.handoffs
    .find((handoff) => handoff.behavior === 'tdd.execute-task')?.executions[0];
  if (!tddRun) fail('Could not locate completed tdd executor run');
  fs.rmSync(path.join(runDir(tddRun), 'result.json'));
  const incomplete = auditWorkflow(root, changeId, state);
  if (incomplete.verdict !== 'block' || !incomplete.blockers.some((item) => item.code === 'EH-AUDIT-HANDOFF-001')) {
    fail(`Expected missing executor result to block audit, got ${incomplete.verdict}: ${JSON.stringify(incomplete.blockers)}`);
  }

  if (process.exitCode !== 1) console.log('Workflow audit smoke passed (valid PASS; forged/missing evidence and invalid stage BLOCK).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
