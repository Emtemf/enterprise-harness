import fs from 'node:fs';
import path from 'node:path';
import { readAgentEvents } from './agent-evidence.mjs';
import { loadBehaviorRegistry, loadHandoffInput, validateHandoffResult } from './handoff.mjs';
import { completedStages as completedStagesV6, STAGE_CONTRACTS as STAGE_CONTRACTS_V6, STAGE_ORDER as STAGE_ORDER_V6 } from './stage-contract.mjs';
import { completedStages as completedStagesV5, STAGE_CONTRACTS as STAGE_CONTRACTS_V5, STAGE_ORDER as STAGE_ORDER_V5 } from '../compat/v5/stage-contract.mjs';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function problem(code, message, recovery) {
  return { code, message, recovery };
}

function inspectBehavior(root, changeId, behavior, contract) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const runsDir = path.join(changeDir, 'runs');
  const runs = fs.existsSync(runsDir)
    ? fs.readdirSync(runsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  const executions = [];
  const checks = [];

  for (const runId of runs) {
    const inputPath = path.join(runsDir, runId, 'input.json');
    // 不可直接信任 runs 下的 JSON：它可以把 checker 的 agent.type 伪造成 executor。
    // loadHandoffInput 会验证 canonical path、behavior registry、agent/skill、input digest
    // 以及 checker 的 parent result/inputRef 约束；只有它通过的 run 才能计入完成证据。
    const loaded = loadHandoffInput(root, path.relative(root, inputPath), { changeId });
    const input = loaded.envelope;
    if (!input || input.behavior !== behavior) continue;
    const resultPath = path.join(runsDir, runId, input.role === 'check' ? 'check.json' : 'result.json');
    const result = readJson(resultPath);
    const validation = [
      ...(loaded.problems || []),
      ...(result ? validateHandoffResult(result, input, input.agent?.type) : ['result artifact is missing']),
    ];
    const record = { runId, inputPath, resultPath, input, result, validation };
    if (input.role === 'execute') executions.push(record);
    if (input.role === 'check') checks.push(record);
  }

  const completedExecutions = executions.filter((run) => run.result && run.validation.length === 0);
  const completedChecks = checks.filter((run) => run.result && run.validation.length === 0);
  const passingChecks = completedChecks.filter((run) => ['pass', 'advisory'].includes(run.result.verdict));
  const checkHasCompletedParent = passingChecks.some((check) => completedExecutions.some((execution) => (
    check.input.parentRunId === execution.runId
  )));

  const issues = [];
  if (completedExecutions.length === 0) {
    issues.push(problem('EH-AUDIT-HANDOFF-001', `${behavior} has no valid execute result`, `create execute handoff and persist result.json for ${behavior}`));
  }
  if (!checkHasCompletedParent) {
    issues.push(problem('EH-AUDIT-HANDOFF-002', `${behavior} has no valid independent checker pass/advisory bound to an execute run`, `create check handoff with parentRunId from a completed ${behavior} execute run`));
  }

  return {
    behavior,
    executor: contract?.executor ?? null,
    checker: contract?.checker ?? null,
    executions: completedExecutions.map((run) => run.runId),
    checks: completedChecks.map((run) => ({ runId: run.runId, verdict: run.result.verdict, parentRunId: run.input.parentRunId })),
    status: issues.length ? 'block' : 'pass',
    issues,
  };
}

function inspectArtifacts(root, changeId, artifacts) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  return artifacts.map((artifact) => {
    const exists = fs.existsSync(path.join(changeDir, artifact));
    return {
      artifact: `harness/changes/${changeId}/${artifact}`,
      status: exists ? 'pass' : 'block',
      issue: exists ? null : problem('EH-AUDIT-ARTIFACT-003', `missing required artifact ${artifact}`, `produce ${artifact} before advancing`),
    };
  });
}

export function auditWorkflow(root, changeId, data, options = {}) {
  const isV6 = data?.schemaVersion === 6;
  const registry = isV6 ? { behaviors: {} } : loadBehaviorRegistry(root);
  const stageOrder = isV6 ? STAGE_ORDER_V6 : STAGE_ORDER_V5;
  const stageContracts = isV6 ? STAGE_CONTRACTS_V6 : STAGE_CONTRACTS_V5;
  const completedStageList = isV6 ? completedStagesV6 : completedStagesV5;
  const v6Stage = isV6 ? data?.stage : null;
  const currentStage = v6Stage || String(data?.workflow?.stage || 'clarify');
  const auditStage = (currentStage === 'route' || currentStage === 'classify') ? 'clarify' : currentStage;
  const invalidStage = !stageOrder.includes(auditStage);
  const completed = new Set(completedStageList({
    ...data,
    stage: auditStage,
    workflow: { ...data.workflow, stage: auditStage },
  }, options.includeCurrent === true));
  const events = readAgentEvents(root, changeId);
  const stages = [];

  for (const stage of stageOrder) {
    const spec = stageContracts[stage];
    const isCompleted = completed.has(stage);
    const isCurrent = stage === auditStage;
    if (!isCompleted && !isCurrent) {
      stages.push({ stage, lifecycle: 'future', status: 'pending', artifacts: [], state: [], handoffs: [], events: [] });
      continue;
    }

    const artifacts = inspectArtifacts(root, changeId, spec.artifacts);
    const state = spec.state(data).map(([field, ok]) => ({
      field,
      status: ok ? 'pass' : 'block',
      issue: ok ? null : problem('EH-AUDIT-STATE-004', `${field} does not meet the stage completion predicate`, `repair durable evidence and update through the supported runtime command`),
    }));
    const behaviors = isV6
      ? []
      : [...spec.requiredBehaviors, ...spec.optionalBehaviors];
    const handoffs = behaviors.map((behavior) => {
      const contract = registry.behaviors?.[behavior];
      const hasBeenDispatched = events.some((event) => event.kind === 'dispatch' && event.behavior === behavior);
      const required = spec.requiredBehaviors.includes(behavior) || hasBeenDispatched;
      if (!required) return { behavior, status: 'not-applicable', required: false, executions: [], checks: [], issues: [] };
      return { ...inspectBehavior(root, changeId, behavior, contract), required: true };
    });
    const stageEvents = events.filter((event) => {
      const behaviorStage = registry.behaviors?.[event.behavior]?.stage;
      return behaviorStage === stage;
    }).map((event) => ({ kind: event.kind, behavior: event.behavior ?? null, runId: event.runId ?? null, agentId: event.agentId ?? null }));
    const checked = [...artifacts, ...state, ...handoffs.filter((handoff) => handoff.required)];
    const blockers = checked.flatMap((item) => item.status === 'block' ? (item.issues ?? [item.issue]).filter(Boolean) : []);
    stages.push({
      stage,
      lifecycle: isCompleted ? 'completed' : 'current',
      status: blockers.length ? 'block' : (isCompleted ? 'pass' : 'in-progress'),
      artifacts,
      state,
      handoffs,
      events: stageEvents,
      blockers,
    });
  }

  const completedStagesAudit = stages.filter((stage) => stage.lifecycle === 'completed');
  const stageProblem = invalidStage
    ? problem(
      'EH-AUDIT-STATE-005',
      `stage is invalid: ${currentStage}`,
      `restore stage to one of: ${stageOrder.join(', ')}`,
    )
    : null;
  const blockers = [
    ...completedStagesAudit.flatMap((stage) => stage.blockers),
    ...(stageProblem ? [stageProblem] : []),
  ];
  return {
    changeId,
    schemaVersion: Number(data?.schemaVersion ?? 0),
    evidencePolicy: (data?.schemaVersion ?? 0) >= 4 ? 'strict' : 'historical-unenforced',
    workflowStage: currentStage,
    verdict: blockers.length ? 'block' : 'pass',
    completedStages: completedStagesAudit.map((stage) => stage.stage),
    stages,
    blockers,
    ledger: {
      eventCount: events.length,
      violations: events.filter((event) => event.kind === 'violation').length,
      codegraphAttempts: events.filter((event) => event.kind === 'codegraph-attempt').length,
    },
  };
}

export function renderWorkflowAudit(audit) {
  const lines = [
    'Enterprise Harness Workflow Audit',
    `changeId: ${audit.changeId}`,
    `schemaVersion: ${audit.schemaVersion} (${audit.evidencePolicy})`,
    `workflowStage: ${audit.workflowStage}`,
    `verdict: ${audit.verdict.toUpperCase()}`,
    `ledger: ${audit.ledger.eventCount} event(s), ${audit.ledger.codegraphAttempts} CodeGraph attempt(s), ${audit.ledger.violations} violation(s)`,
    '',
  ];
  for (const stage of audit.stages) {
    lines.push(`[${stage.status.toUpperCase()}] ${stage.stage} (${stage.lifecycle})`);
    for (const artifact of stage.artifacts) lines.push(`  artifact ${artifact.status === 'pass' ? '✓' : '✗'} ${artifact.artifact}`);
    for (const state of stage.state) lines.push(`  state    ${state.status === 'pass' ? '✓' : '✗'} ${state.field}`);
    for (const handoff of stage.handoffs) {
      if (handoff.status === 'not-applicable') continue;
      lines.push(`  handoff  ${handoff.status === 'pass' ? '✓' : '✗'} ${handoff.behavior} execute=[${handoff.executions.join(', ') || '-'}] check=[${handoff.checks.map((check) => `${check.runId}:${check.verdict}`).join(', ') || '-'}]`);
    }
    for (const blocker of stage.blockers) lines.push(`  BLOCK ${blocker.code}: ${blocker.message}`);
  }
  return lines.join('\n');
}
