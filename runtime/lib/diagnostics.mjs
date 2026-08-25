export const DIAGNOSTICS = Object.freeze({
  'EH-PATH-001': {
    summary: 'ID、artifact reference 或 filesystem target 不安全。',
    recovery: '使用 repository-relative 非 symlink 路径和 safe identifier，修正后原样重试命令。',
  },
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
    summary: 'v5 compatibility task 缺少与 executor/run/argv 绑定的真实 RED/GREEN/REFACTOR receipt。',
    recovery: '仅对 v5 change，在 tdd-executor worktree 中通过 enterprise-harness tdd-run 执行冻结命令；v6 使用 task-run。',
  },
  'EH-TASK-RECEIPT-025': {
    summary: 'v6 implement task 的 strategy、Handoff、argv、phase chain 或 machine receipt 无效。',
    recovery: '由绑定到 execute run 的 implementer 通过 enterprise-harness task-run 执行 frozen phase chain，并创建新的 run 修复失败执行。',
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
  'EH-SPAWN-DEPTH-020': {
    summary: 'Subagent 生成深度不足以让 forked 阶段派发自己的 executor 和 checker。',
    recovery: '在 .claude/settings.json 的 env 中设置 CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3 后重启会话，再运行 enterprise-harness doctor 确认。',
  },
  'EH-CODEGRAPH-INDEX-021': {
    summary: 'CodeGraph 索引不可用，代码探索会静默退化成全量 grep/read。',
    recovery: '在目标项目根目录运行 codegraph init 建立索引，再运行 enterprise-harness doctor 确认 codegraph 检查为 indexed。',
  },
  'EH-AUDIT-RUNTIME-006': {
    summary: 'Workflow audit 无法读取或校验 durable evidence。',
    recovery: '运行 enterprise-harness workflow audit <change-id> --json，修复首个无效 artifact/handoff 后重试 status。',
  },
  'EH-QUESTION-CANDIDATE-106': {
    summary: 'Clarify question candidate 缺失或无效。',
    recovery: '重新生成并保存 canonical candidate，再执行 clarify prepare-question。',
  },
  'EH-QUESTION-STALE-107': {
    summary: 'Clarify question candidate 或其输入已过期。',
    recovery: '从当前 authoritative inputs 重新生成 candidate 和全部 input digests，再重新 prepare。',
  },
  'EH-QUESTION-ACTIVE-108': {
    summary: '当前 active change 不是 v6 clarify。',
    recovery: '绑定正确的 active v6 change 并恢复到 stage=clarify 后重试，不手改 state projection。',
  },
  'EH-QUESTION-PENDING-110': {
    summary: '已有未关闭的 authorized question。',
    recovery: '先按 status 的动作重问并 resolve，或运行 enterprise-harness clarify recover <changeId>。',
  },
  'EH-QUESTION-PENDING-111': {
    summary: '当前调用没有可用的 pending question authorization。',
    recovery: '对 fresh canonical candidate 重新执行 clarify prepare-question；若文件损坏，先从可信运行态恢复再重试。',
  },
  'EH-QUESTION-MISMATCH-112': {
    summary: 'AskUserQuestion 输入与预授权 candidate 不一致。',
    recovery: '原样重问 pending question，不修改问题、header、选项、description 或 multiSelect。',
  },
  'EH-QUESTION-ANSWER-113': {
    summary: 'AskUserQuestion answer 无法匹配唯一 option。',
    recovery: '使用 pending candidate 中一个原始 option label 作答；已记录事件不可改写。',
  },
  'EH-QUESTION-RECOVERY-114': {
    summary: 'pending state 与 decision ledger 冲突。',
    recovery: '保留 append-only ledger，恢复一致的 candidate/pending evidence 后运行 enterprise-harness clarify recover <changeId>。',
  },
  'EH-QUESTION-INPUT-115': {
    summary: 'Clarify question hook payload 无效。',
    recovery: '按 Claude Code AskUserQuestion payload 发送所需字段；不要附加 rationale 或 chat 文本。',
  },
  'EH-DEBT-SCHEMA-120': {
    summary: 'Clarify technical-debt assessment 的结构、引用或 change 绑定无效。',
    recovery: '修正 canonical debt-assessment.json 中首个无效字段或引用后重新运行 clarify validate-debt。',
  },
  'EH-DEBT-DISPOSITION-121': {
    summary: 'Relevant technical debt 没有恰好一个匹配的 durable disposition。',
    recovery: '记录匹配 debtId、targetRef 和 status 的 debt-disposition event 后重新验证 assessment。',
  },
  'EH-DEBT-STALE-122': {
    summary: 'Technical-debt assessment 或其 disposition decision 使用了缺失或过期输入。',
    recovery: '用当前 authoritative inputs 重新生成 debt assessment 和关联 decision 后再验证。',
  },
  'EH-PROJECT-CONTRACT-SCHEMA-123': {
    summary: 'Project-contract assessment 的结构、状态规则或 disposition event 无效。',
    recovery: '修正首个 status/event 不一致并重新运行 clarify validate-project-contract。',
  },
  'EH-PROJECT-CONTRACT-STALE-124': {
    summary: 'Project instruction evidence 或 project-contract assessment 输入已过期。',
    recovery: '重新读取当前 instruction files、更新 digests，再重新验证 assessment。',
  },
  'EH-PROJECT-CONTRACT-SCOPE-125': {
    summary: 'Project-contract assessment 试图引用不安全路径或携带 instruction write/apply payload。',
    recovery: '删除 write/apply 字段并仅保留 repository-relative instruction evidence 后重试。',
  },
  'EH-CLASSIFICATION-ROUTE-128': {
    summary: 'Clarify classification 与 append-only classification-route event 不一致。',
    recovery: '按当前 evidence-derived tier 追加匹配 route event，再原子写入 classification v2。',
  },
  'EH-CLASSIFICATION-STALE-129': {
    summary: 'Clarify classification 的 evidence 或 input digest 已过期。',
    recovery: '从当前 requirements、snapshot、assessments 和 ResearchPackets 重新计算 classification。',
  },
  'EH-CLARIFY-RESEARCH-LANES-144': { summary: 'Clarify code/docs research applicability 尚未决定。', recovery: '分别决定 code 与 docs research lane 是否适用。' },
  'EH-CLARIFY-RESEARCH-131': { summary: 'Clarify required ResearchPacket 缺失、无效或过期。', recovery: '完成并持久化每个 required fresh ResearchPacket。' },
  'EH-CLARIFY-RESEARCH-CONFLICTS-145': { summary: 'Clarify research conflict、degraded packet 或 uncertainty 尚未处置。', recovery: '处置 degraded research、冲突与 remaining fact uncertainty。' },
  'EH-CLARIFY-TOPOLOGY-132': { summary: 'Clarify component topology 未确认。', recovery: '确认 evidence-derived component topology。' },
  'EH-CLARIFY-AMBIGUITY-133': { summary: 'Clarify evidence-bound ambiguity 未达阈值。', recovery: '解决 weakest ambiguity 并重新计算 requirements。' },
  'EH-CLARIFY-QUESTION-134': { summary: '仍有一个 authorized Clarify question 未关闭。', recovery: '原样解决当前 authorized pending question。' },
  'EH-CLARIFY-DECISIONS-135': { summary: 'Clarify decision prefix 未密封或已过期。', recovery: '密封当前 ordered decision-ledger prefix。' },
  'EH-CLARIFY-DEBT-136': { summary: 'Clarify technical-debt disposition 未完成。', recovery: '记录并验证全部 applicable debt dispositions。' },
  'EH-CLARIFY-CONTRACT-137': { summary: 'Clarify project-contract disposition 未完成。', recovery: '记录并验证 project-contract assessment。' },
  'EH-CLARIFY-REQUIREMENTS-138': { summary: '当前 Clarify requirements 未批准。', recovery: '批准并持久化当前 evidence-derived requirements。' },
  'EH-CLARIFY-CLASSIFICATION-139': { summary: 'Strict classification v2 缺失或不新鲜。', recovery: '从当前 authoritative inputs 重新计算并持久化 classification。' },
  'EH-CLARIFY-SELF-CHECK-140': { summary: 'Clarify StageResult self-check 缺失或未通过。', recovery: '发布 fresh passing Clarify StageResult self-check。' },
  'EH-CLARIFY-REVIEW-141': { summary: 'Clarify independent ReviewResult 缺失或未通过。', recovery: '发布 fresh independent passing Clarify ReviewResult。' },
  'EH-CLARIFY-TECPC-142': { summary: 'Clarify TECPC 未闭合。', recovery: '闭合 Clarify TECPC 且不保留 pending correction。' },
  'EH-CLARIFY-PROOF-143': { summary: 'Fresh digest-bound ClarifyProof 缺失。', recovery: '发布与 StageResult 和 ReviewResult 绑定的 ClarifyProof。' },
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
