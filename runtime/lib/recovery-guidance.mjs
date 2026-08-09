import { loadActiveChange } from './gates.mjs';
import { buildWorkflowResult } from './workflow.mjs';

export function buildRecoveryGuidance(root) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    return {
      present: false,
      changeId: null,
      workflowStage: null,
      nextEntry: '/harness',
      assetGuidance: 'change-specific 结论：优先写回当前 active change 资产；若当前没有 active change，请先补足对应 change bundle。',
    };
  }

  const workflow = buildWorkflowResult(root, active.changeId, active.data);
  return {
    present: true,
    changeId: active.changeId,
    workflowStage: workflow.stage,
    nextEntry: workflow.nextEntry,
    nextAction: workflow.nextAction,
    currentGap: workflow.currentGap,
    audit: workflow.audit,
    assetGuidance: `change-specific 结论：优先写回 harness/changes/${active.changeId}/ 下的 change.md / design.md / tasks.md / validation.md / evidence/*.md / reviews/*.json。`,
  };
}
