import fs from 'node:fs';
import path from 'node:path';

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
    case 'clarify': return '/harness';
    case 'route': return '/harness';
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
  if (stage === 'route') return 'impact-explore';
  if (stage === 'design') {
    if (data?.impact?.api === 'yes' || data?.impact?.data === 'yes') return 'impact-explore';
    if (data?.tooling?.documentation?.libraries?.length) return 'doc-research';
    return 'code-explore';
  }
  if (stage === 'verify') return 'impact-explore';
  return null;
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
