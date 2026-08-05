import fs from 'node:fs';
import path from 'node:path';

export function computeGuideReminder(root, changeId) {
  if (!root || !changeId) return null;
  const guidePath = path.join(root, 'harness', 'changes', changeId, 'GUIDE.md');
  return fs.existsSync(guidePath) ? null : '提醒：该 change 尚无 GUIDE.md 导航卡（不阻断）。';
}

export function inferWorkflowStage(changeId, data) {
  if (!changeId || !data) return null;
  const explicitStage = data.workflow?.stage;
  if (explicitStage === 'design' && (!data.workflow?.clarifyReady || !data.workflow?.userConfirmedScope)) {
    return 'clarify';
  }
  if (explicitStage === 'design' && !data.workflow?.routeReady) {
    return 'route';
  }
  if (explicitStage === 'plan' && (!data.workflow?.clarifyReady || !data.workflow?.userConfirmedScope || !data.gates?.designApproved)) {
    return 'design';
  }
  if (explicitStage) return explicitStage;
  if (changeId === 'clarify-first-staged-orchestrator') {
    if (data.validation?.status === 'fresh' && data.state === 'VALIDATED') return 'archive';
    if (data.state === 'VALIDATED' || data.state === 'REVIEWED') return 'verify';
    if (data.state === 'EXECUTING') return 'tdd';
    if (data.state === 'TASKED') return 'plan';
    if (data.approvals?.design?.status === 'pass' || data.gates?.designApproved) return 'design';
    if (data.state === 'DISCOVERED') return 'route';
    return 'clarify';
  }
  if (data.validation?.status === 'fresh' && data.state === 'VALIDATED') return 'archive';
  if (data.state === 'VALIDATED' || data.state === 'REVIEWED') return 'verify';
  if (data.state === 'EXECUTING') return 'tdd';
  if (data.state === 'TASKED') return 'plan';
  if (data.approvals?.design?.status === 'pass' || data.gates?.designApproved) return 'design';
  if (data.state === 'DISCOVERED') return 'route';
  return 'clarify';
}

export function recommendNextEntry(stage, data = null) {
  if (data?.workflow?.nextEntry && data?.workflow?.stage === stage) return data.workflow.nextEntry;
  switch (stage) {
    case 'clarify': return '/harness-clarify';
    case 'route': return '/harness-route';
    case 'design': return '/harness-design';
    case 'plan': return '/harness-plan';
    case 'tdd': return '/harness-tdd';
    case 'verify': return '/harness-verify';
    case 'archive': return '/harness';
    default: return '/harness';
  }
}

export function recommendExplorationLane(stage, data = null) {
  if (!stage) return null;
  if (stage === 'clarify') {
    if (data?.tooling?.documentation?.libraries?.length) return 'doc-research';
    return 'code-explore';
  }
  if (stage === 'route') return 'code-explore';
  if (stage === 'design') {
    if (data?.impact?.api === 'yes' || data?.impact?.data === 'yes') return 'code-explore';
    if (data?.tooling?.documentation?.libraries?.length) return 'doc-research';
    return 'code-explore';
  }
  if (stage === 'verify') return 'code-explore';
  return null;
}

export function recommendNextAction(changeId, data, stage, currentGap, pendingDecision = null) {
  if (pendingDecision) {
    return pendingDecision.defaultDecision
      ? `workflow decide ${changeId} ${pendingDecision.defaultDecision}`
      : `workflow decide ${changeId} <${pendingDecision.options.join('|')}>`;
  }
  if (changeId && data?.workflow?.stage === 'design' && currentGap === 'execution deepening 第一批切片待冻结。') {
    return `workflow decide ${changeId} freeze-slice`;
  }
  return recommendNextEntry(stage, data);
}

export function inferPendingDecision(changeId, data, stage, currentGap, shouldSuppressExecutionReadiness = () => false) {
  if (!stage || !data) return null;
  if (stage === 'clarify' && !data.workflow?.clarifyReady) {
    return {
      kind: 'requirement-clarification',
      message: currentGap,
      // confirm-clarity 是 clarify 的唯一出口；其余选项只记录事件，不推进 gate。
      options: ['confirm-clarity', 'answer-next-question', 'narrow-scope', 'stop'],
      evidence: [`harness/changes/${changeId}/requirements.md`],
    };
  }
  if (stage === 'clarify' && !data.workflow?.userConfirmedScope) {
    return {
      kind: 'scope-confirmation',
      message: '需要用户确认执行范围后才能继续 route。',
      options: ['confirm-scope', 'revise-scope'],
      evidence: [`harness/changes/${changeId}/requirements.md`],
    };
  }
  if (stage === 'route' && !data.workflow?.routeReady) {
    return {
      kind: 'route-confirmation',
      message: currentGap,
      options: ['confirm-route', 'revise-route', 'stop'],
      evidence: [`harness/changes/${changeId}/change.md`],
    };
  }
  if (stage === 'design' && data.approvals?.design?.status && data.approvals?.design?.status !== 'block' && !data.gates?.designApproved) {
    if (shouldSuppressExecutionReadiness(changeId, data)) {
      return null;
    }
    return {
      kind: 'execution-readiness',
      message: '需要确认 execution deepening 第一批切片是否已冻结，可以进入 plan。',
      options: ['freeze-slice', 'revise-slice'],
      defaultDecision: 'freeze-slice',
      evidence: [`harness/changes/${changeId}/design.md`],
    };
  }
  if (stage === 'design' && !(data.approvals?.design?.status === 'pass' || data.gates?.designApproved)) {
    return {
      kind: 'design-approval',
      message: '需要 design approval 后才能进入 plan。',
      options: ['approve', 'request-changes', 'reject'],
      evidence: [`harness/changes/${changeId}/design.md`],
    };
  }
  // plan/tdd/verify 各自的出口决策。缺任一项，stage 就没有任何命令可以推进，
  // 链路会永久停在该阶段（见 runtime/test/workflow-stage-progression-smoke.mjs）。
  if (stage === 'plan' && !data.workflow?.planReady) {
    if (currentGap === 'plan 尚未 ready。') {
      return {
        kind: 'plan-readiness',
        message: currentGap,
        options: ['freeze-plan', 'revise-plan'],
        defaultDecision: 'freeze-plan',
        evidence: [`harness/changes/${changeId}/tasks.md`],
      };
    }
    return null;
  }
  if (stage === 'tdd' && data.workflow?.tddStatus === 'refactor-verified') {
    return {
      kind: 'tdd-completion',
      message: currentGap,
      options: ['enter-verify', 'revise-task'],
      defaultDecision: 'enter-verify',
      evidence: [`harness/changes/${changeId}/tasks.md`],
    };
  }
  if (stage === 'verify' && data.validation?.status === 'fresh') {
    return {
      kind: 'verify-completion',
      message: currentGap,
      options: ['enter-archive', 'revise-verification'],
      defaultDecision: 'enter-archive',
      evidence: [`harness/changes/${changeId}/validation.md`],
    };
  }
  return null;
}

export function inferRunnerStatus(stage, pendingDecision) {
  if (stage === 'archive') return 'complete';
  if (pendingDecision) return 'paused';
  return 'ready';
}

export function buildWorkflowResult(root, changeId, data, shouldSuppressExecutionReadiness = () => false) {
  const stage = inferWorkflowStage(changeId, data);
  const nextEntry = recommendNextEntry(stage, data);
  const recommendedLane = recommendExplorationLane(stage, data);
  const currentGap = inferCurrentGap(root, changeId, data, stage);
  const pendingDecision = inferPendingDecision(changeId, data, stage, currentGap, shouldSuppressExecutionReadiness);
  const nextAction = recommendNextAction(changeId, data, stage, currentGap, pendingDecision);
  return {
    changeId,
    state: data.state ?? null,
    stage,
    status: inferRunnerStatus(stage, pendingDecision),
    nextAction,
    pendingDecision,
    recommendedLane,
    currentGap,
    blockers: data.blockers ?? [],
    approvals: data.approvals ?? {},
    revision: data.revision ?? 1,
    lastEventId: data.lastEventId ?? null,
    workflow: data.workflow ?? null,
    validation: data.validation ?? null,
    nextEntry,
  };
}

export function applyClarityConfirmationDecision(data, decision) {
  if (decision === 'confirm-clarity') {
    data.workflow.clarifyReady = true;
    // scope 仍需用户单独确认；两个标志独立，不得相互替代。
    if (data.workflow.userConfirmedScope) {
      data.workflow.stage = 'route';
      data.workflow.nextEntry = '/harness-route';
    }
  }
  if (decision === 'narrow-scope') {
    data.workflow.clarifyReady = false;
    data.workflow.userConfirmedScope = false;
    data.workflow.stage = 'clarify';
    data.workflow.nextEntry = '/harness-clarify';
  }
  return data;
}

export function applyPlanReadinessDecision(data, decision) {
  if (decision === 'freeze-plan') {
    data.workflow.planReady = true;
    data.state = 'PLANNED';
    data.workflow.stage = 'tdd';
    data.workflow.nextEntry = '/harness-tdd';
  }
  if (decision === 'revise-plan') {
    data.workflow.planReady = false;
    data.workflow.stage = 'plan';
    data.workflow.nextEntry = '/harness-plan';
  }
  return data;
}

export function applyTddCompletionDecision(data, decision) {
  if (decision === 'enter-verify') {
    data.workflow.stage = 'verify';
    data.workflow.nextEntry = '/harness-verify';
  }
  if (decision === 'revise-task') {
    data.workflow.tddStatus = 'not-started';
    data.workflow.stage = 'tdd';
    data.workflow.nextEntry = '/harness-tdd';
  }
  return data;
}

export function applyVerifyCompletionDecision(data, decision) {
  if (decision === 'enter-archive') {
    data.workflow.stage = 'archive';
    data.workflow.nextEntry = '/harness';
  }
  if (decision === 'revise-verification') {
    // 重新验证前先让 validation 失效，避免用旧 digest 直接归档。
    if (data.validation) data.validation.status = 'stale';
    data.workflow.stage = 'verify';
    data.workflow.nextEntry = '/harness-verify';
  }
  return data;
}

export function applyScopeConfirmationDecision(data, decision) {
  if (decision === 'confirm-scope') {
    data.workflow.userConfirmedScope = true;
    if (data.workflow.clarifyReady) {
      data.workflow.stage = 'route';
      data.workflow.nextEntry = '/harness-route';
    }
  }
  if (decision === 'revise-scope') {
    data.workflow.userConfirmedScope = false;
    data.workflow.stage = 'clarify';
    data.workflow.nextEntry = '/harness-clarify';
  }
  return data;
}

export function applyRouteConfirmationDecision(data, decision) {
  if (decision === 'confirm-route') {
    data.workflow.routeReady = true;
    data.workflow.stage = 'design';
    data.workflow.nextEntry = '/harness-design';
  }
  if (decision === 'revise-route') {
    data.workflow.routeReady = false;
    data.workflow.stage = 'route';
    data.workflow.nextEntry = '/harness-route';
  }
  return data;
}

export function applyDesignApprovalDecision(data, decision) {
  if (decision === 'approve') {
    data.gates = data.gates || {};
    data.gates.designApproved = true;
    data.state = 'DESIGN_APPROVED';
    data.workflow.stage = 'plan';
    data.workflow.nextEntry = '/harness-plan';
    data.workflow.planReady = false;
  }
  if (decision === 'request-changes' || decision === 'reject') {
    data.gates = data.gates || {};
    data.gates.designApproved = false;
    data.state = 'DISCOVERED';
    data.workflow.stage = 'design';
    data.workflow.nextEntry = '/harness-design';
    data.workflow.planReady = false;
  }
  return data;
}

export function applyExecutionReadinessDecision(data, decision, baselineDesignSha256 = null) {
  if (decision === 'freeze-slice') {
    data.gates = data.gates || {};
    data.gates.designApproved = true;
    data.state = 'DESIGN_APPROVED';
    data.workflow.stage = 'plan';
    data.workflow.nextEntry = '/harness-plan';
    data.workflow.planReady = false;
    delete data.workflow.suppressionBaseline;
  }
  if (decision === 'revise-slice') {
    data.gates = data.gates || {};
    data.gates.designApproved = false;
    data.state = 'DISCOVERED';
    data.workflow.stage = 'design';
    data.workflow.nextEntry = '/harness-design';
    data.workflow.planReady = false;
    data.workflow.suppressionBaseline = {
      designMdSha256: baselineDesignSha256,
    };
  }
  return data;
}

export function inferCurrentGap(root, changeId, data, workflowStage) {
  if (!changeId || !data || !workflowStage) return '当前没有 active change。';
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const hasRequirements = fs.existsSync(path.join(changeDir, 'requirements.md'));
  const hasDesign = fs.existsSync(path.join(changeDir, 'design.md'));
  const hasTasks = fs.existsSync(path.join(changeDir, 'tasks.md'));
  const tddStatus = data.workflow?.tddStatus || 'not-started';

  switch (workflowStage) {
    case 'clarify':
      if (!hasRequirements) return '缺少 requirements.md。';
      if (!data.workflow?.clarifyReady) return 'clarify 尚未达标。';
      if (!data.workflow?.userConfirmedScope) return '用户尚未确认执行范围。';
      return 'clarify 已就绪，可推进到 route。';
    case 'route':
      if (!data.workflow?.clarifyReady) return 'clarify 结果尚未可消费。';
      if (!data.workflow?.userConfirmedScope) return '执行范围尚未被用户确认。';
      if (!data.workflow?.routeReady) return 'route 尚未确认 tier 与影响面。';
      return 'route 已形成，下一步应进入 design。';
    case 'design':
      if (!hasDesign) return '缺少 design.md。';
      if (data.workflow?.suppressionBaseline?.designMdSha256) {
        return 'execution deepening 切片仍需修订。';
      }
      if (data.approvals?.design?.status && data.approvals?.design?.status !== 'block' && !data.gates?.designApproved) {
        return 'execution deepening 第一批切片待冻结。';
      }
      if (!(data.approvals?.design?.status === 'pass' || data.gates?.designApproved)) return 'design 尚未批准。';
      return 'design 已批准，下一步应进入 plan。';
    case 'plan':
      if (!hasTasks) return '缺少 tasks.md。';
      if (!data.workflow?.planReady) return 'plan 尚未 ready。';
      return 'plan 已就绪，下一步应进入 tdd。';
    case 'tdd':
      if (tddStatus !== 'refactor-verified') return `TDD 子状态仍为 ${tddStatus}。`;
      return 'TDD 已完成，下一步应进入 verify。';
    case 'verify':
      if (data.validation?.status !== 'fresh') return `validation.status=${data.validation?.status}，仍需 fresh evidence。`;
      return '验证证据已 fresh，可进入 archive。';
    case 'archive':
      return '当前 change 已满足归档条件。';
    default:
      return '尚未识别当前缺口。';
  }
}
