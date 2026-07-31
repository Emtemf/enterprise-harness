export const DIAGNOSTICS = Object.freeze({
  'EH-HANDOFF-INPUT-001': {
    summary: 'Agent 派发缺少或无法读取 HANDOFF_INPUT。',
    recovery: '先运行 enterprise-harness handoff create，再把输出的 HANDOFF_INPUT 行原样放入 Agent prompt。',
  },
  'EH-HANDOFF-SCHEMA-002': {
    summary: 'Handoff envelope 缺少必填字段或字段互相矛盾。',
    recovery: '运行 enterprise-harness handoff validate <path> 查看具体字段错误。',
  },
  'EH-AGENT-BINDING-003': {
    summary: 'Agent dispatch、start、stop 或返回结果无法绑定到同一个 run。',
    recovery: '运行 enterprise-harness trace <run-id>，确认 agent type、runId、toolUseId 与 active change。',
  },
  'EH-SUBAGENT-RESULT-004': {
    summary: 'Subagent 未返回可解析的结构化 HANDOFF_RESULT。',
    recovery: '按预加载 Skill 的输出模板返回 JSON envelope；不要只回复 done/pass。',
  },
  'EH-CHECKER-REQUIRED-005': {
    summary: '受治理行为缺少独立 checker 或 checker verdict。',
    recovery: '由主 orchestrator 读取 executor result，再创建 role=check 的 handoff 并派发注册表指定 checker。',
  },
  'EH-CLARIFY-AMBIGUITY-006': {
    summary: '澄清评分不完整、低于阈值或缺少评分依据。',
    recovery: '针对 weakest dimension 一次只问一个问题，更新 requirements.md 后重新校验。',
  },
  'EH-TDD-RECEIPT-007': {
    summary: '当前 task 缺少与 executor/run/argv 绑定的真实 RED/GREEN/REFACTOR receipt。',
    recovery: '在 tdd-executor worktree 中通过 enterprise-harness tdd-run 执行冻结命令。',
  },
  'EH-COMPLETION-GATE-008': {
    summary: 'Task/session 完成声明缺少累计 gate、独立检查或新鲜验证证据。',
    recovery: '运行 enterprise-harness doctor 和 enterprise-harness workflow status --json，按 currentGap 恢复。',
  },
  'EH-AGENT-FAILURE-009': {
    summary: '受治理 Agent 调用失败，结果未形成可消费 handoff。',
    recovery: '使用 runId 查看 events.jsonl/agent ledger，修复失败原因后以新 attempt 重试。',
  },
  'EH-HOOK-SNAPSHOT-010': {
    summary: 'Bash 写入缺少可归因的前后快照。',
    recovery: '确认 PreToolUse 与 PostToolUse 使用相同 tool_use_id，并重试该次命令。',
  },
  'EH-HOOK-POST-WRITE-011': {
    summary: 'Post-write 无法解析事件或完成增量归因。',
    recovery: '查看 violation ledger 中的 toolUseId、target 与 detail，修复 hook 输入后重新验证。',
  },
});

export function diagnostic(code) {
  return DIAGNOSTICS[code] || null;
}

export function formatDiagnostic(code, detail = '', context = {}) {
  const known = diagnostic(code);
  const parts = [`BLOCK [${code}] ${known?.summary || 'Enterprise Harness governance failure.'}`];
  if (detail) parts.push(`detail=${detail}`);
  if (context.changeId) parts.push(`change=${context.changeId}`);
  if (context.runId) parts.push(`run=${context.runId}`);
  if (known?.recovery) parts.push(`recovery=${known.recovery}`);
  return parts.join(' | ');
}
