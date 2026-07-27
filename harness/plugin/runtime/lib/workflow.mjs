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
    case 'clarify': return '/harness-intake';
    case 'route': return '/harness-intake';
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
      options: ['answer-next-question', 'narrow-scope', 'stop'],
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
      if (!['DISCOVERED', 'CHANGE_APPROVED', 'SPECIFIED', 'DESIGN_APPROVED', 'TASKED', 'EXECUTING', 'REVIEWED', 'VALIDATED', 'ARCHIVED'].includes(data.state)) {
        return 'final route / state 推进尚未完成。';
      }
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
