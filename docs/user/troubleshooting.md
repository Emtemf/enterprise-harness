# 故障排查

不需要提交 Claude 的完整思考过程。优先提供错误码、runId、脱敏状态和可复现命令。

## 没有进入澄清就开始写代码

可能原因：没有从 canonical skill 入口开始，或 hooks 未加载。

运行：

```bash
enterprise-harness status
enterprise-harness doctor
```

提交：插件版本、入口命令、SessionStart 输出和 `state.json`。

## code-explore 没有执行

可能原因：Agent subtype 未使用 `enterprise-harness:code-explore`、缺少 HANDOFF_INPUT 或 dispatch/start 未绑定。

运行：

```bash
enterprise-harness trace <run-id>
```

提交：runId、agent type、`EH-AGENT-BINDING-003` 详情和脱敏 ledger。

## 主 agent 忽略 subagent 结果

表现：相同问题被重复探索，或没有把 result artifact 放入 checker/下一阶段 inputRefs。

提交：executor runId、result path、后续 handoff inputRefs。

## TDD 没有真实执行 Maven

检查：

```text
harness/command-policy.json
harness/changes/<change-id>/task-commands.json
```

receipt 必须记录 exact argv、exit code、时间、agent、worktree 和 digest。v6 使用 `task-run` 生成
`runtime-runner` receipt；`tdd-run` 仅用于 v5 compatibility。缺失时通常返回
`EH-TASK-RECEIPT-025`，旧 v5 流程则返回 `EH-TDD-RECEIPT-007`。

## 私有 marketplace 无法更新

如果 `claude plugin marketplace update enterprise-harness` 输出：

```text
Cannot prompt because user interactivity has been disabled
fatal: unable to get password from user
Failed to clone marketplace repository
```

这表示 Claude Code 在后台调用 Git 时无法读取 private GitHub repository 的凭据。确认用户有
`Emtemf/enterprise-harness` 的访问权限，然后在操作系统终端（不是 Claude 的 tool prompt）运行：

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
git ls-remote https://github.com/Emtemf/enterprise-harness.git
```

只有 `git ls-remote` 成功输出 refs 后再运行：

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

如果 plugin 安装在其他 scope，把 `local` 替换成实际 scope；不要省略 scope。

## Hook 输出重复

如果 SessionStart banner 或 Stop guidance 出现两遍，先确认：

1. 本地项目 settings 和插件 hooks 是否都注册了同一批 hook；
2. `.claude/settings.json` 必须使用 `$CLAUDE_PROJECT_DIR`，插件 `hooks/hooks.json` 必须使用 `${CLAUDE_PLUGIN_ROOT}`；
3. 改完 hook 后要 `/reload-plugins`，必要时完全退出并启动全新 Claude Code 会话。

重复去重依赖事件身份，不依赖“这个 hook 是不是插件”这种环境猜测。SessionStart 需要 `session_id + source + transcript stamp`，Stop 需要 `session_id + transcript stamp`；缺少身份时应 fail open，只抑制重复输出，不抑制真实门禁。

## 常见错误码

| 错误码 | 含义 | 恢复 |
|---|---|---|
| `EH-HANDOFF-INPUT-001` | 缺少 handoff input | 重新创建 handoff |
| `EH-HANDOFF-SCHEMA-002` | envelope 不合法 | 运行 handoff validate |
| `EH-AUDIT-HANDOFF-001` | v5 compatibility 阶段缺少有效 executor `result.json` | 仅对 `runtime/compat/v5/` 历史 handoff 生效；按对应 behavior 重新创建 execute handoff 并持久化 result |
| `EH-AUDIT-HANDOFF-002` | v5 compatibility executor 缺少绑定 runId 的独立 checker | 仅对 `runtime/compat/v5/` 历史 handoff 生效；用 executor runId 创建 check handoff 并保留 `check.json` |
| `EH-AUDIT-RESULT-007` | v6 阶段的结构化 result gate 未通过 | 修复列出的 StageResult、ReviewResult、TECPC 或 digest freshness 问题；重新生成独立 review 后重跑 `workflow audit <change-id>` |
| `EH-AUDIT-ARTIFACT-003` | 已完成阶段缺少必需 artifact | 运行 `workflow audit <change-id>` 定位文件，并回到该阶段以新 run 产出 |
| `EH-AUDIT-STATE-004` | state 投影不满足阶段完成谓词 | 不手改 state；补齐 evidence 后运行该阶段对应 lifecycle/workflow 命令 |
| `EH-AUDIT-STATE-005` | `workflow.stage` 非法，audit 不能确定所处阶段 | 运行 `workflow status --json` 对照 state schema；通过受支持的 workflow 决策恢复合法 stage，不手改投影 |
| `EH-AUDIT-RUNTIME-006` | status 无法完成 durable evidence audit | 运行 `workflow audit <change-id> --json`，修复首个无效 artifact/handoff 后重试 status |
| `EH-AGENT-BINDING-003` | dispatch/start/result 不一致 | trace runId |
| `EH-SUBAGENT-RESULT-004` | result 无法解析 | 按 skill schema 返回 |
| `EH-CHECKER-REQUIRED-005` | 缺少独立 checker | 创建 check handoff |
| `EH-CLARIFY-AMBIGUITY-006` | 歧义评分不足 | 补 weakest dimension |
| `EH-CLASSIFICATION-ROUTE-128` | classification tier 与 route event 不一致 | 按当前 evidence-derived tier 追加匹配 route event 后重算 |
| `EH-CLASSIFICATION-STALE-129` | classification input digest 过期 | 从当前 authoritative inputs 重算 classification |
| `EH-CLARIFY-RESEARCH-LANES-144` | code/docs research applicability 未决定 | 分别决定两个 lane 是否适用 |
| `EH-CLARIFY-RESEARCH-131` | required research 缺失、无效或过期 | 完成并持久化 required fresh ResearchPackets |
| `EH-CLARIFY-RESEARCH-CONFLICTS-145` | research degraded、冲突或 uncertainty 未处置 | 处置冲突与 remaining fact uncertainty |
| `EH-CLARIFY-TOPOLOGY-132` | component topology 未确认 | 确认 evidence-derived topology |
| `EH-CLARIFY-AMBIGUITY-133` | ambiguity threshold 未达标 | 解决 weakest ambiguity |
| `EH-CLARIFY-QUESTION-134` | authorized question 仍 pending | 原样解决该问题 |
| `EH-CLARIFY-DECISIONS-135` | decision prefix 未密封 | 密封 ordered ledger prefix |
| `EH-CLARIFY-DEBT-136` | debt dispositions 未完成 | 完成 canonical debt assessment |
| `EH-CLARIFY-CONTRACT-137` | project-contract disposition 未完成 | 完成 canonical project-contract assessment |
| `EH-CLARIFY-REQUIREMENTS-138` | requirements 未批准 | 批准当前 evidence-derived requirements |
| `EH-CLARIFY-CLASSIFICATION-139` | classification 不新鲜 | 从 authoritative inputs 重新计算 |
| `EH-CLARIFY-SELF-CHECK-140` | Clarify self-check 未通过 | 发布 passing StageResult self-check |
| `EH-CLARIFY-REVIEW-141` | independent review 未通过 | 发布 passing ReviewResult |
| `EH-CLARIFY-TECPC-142` | TECPC 未闭合，或 assertion evidence 未被 canonical artifact/TECPC envelope 覆盖 | 清除 correction、补齐 evidence/context 绑定并重新生成 completion result/review |
| `EH-CLARIFY-PROOF-143` | lifecycle transition 已尝试发布 ClarifyProof，但即时重验失败 | 保持 Clarify，修复报告的 proof 写入/验证失败后重试 transition |
| `EH-CHANGE-TRANSACTION-150` | change 正在执行独占阶段事务 | 等当前 transition/writer 完成后重试；不要手动删除 lock |
| `EH-CHANGE-WRITE-LEASE-151` | 仍有已授权的写工具尚未完成 PostToolUse | 等对应工具完成；失败时由 PostToolUseFailure 释放，过期 lease 由 runtime 回收 |
| `EH-CHANGE-WRITE-LEASE-152` | 写 hook 缺少 Claude Code `tool_use_id` | 检查 hook 输入/宿主版本并重试；不要绕过 PreToolUse |
| `EH-CHANGE-WRITE-LEASE-153` | 失败写工具的 lease 释放异常 | 运行 `enterprise-harness doctor`，保留错误码与脱敏 hook 输入 |
| `EH-PROMPT-RECEIPT-154` | 当前 change 没有可绑定的 UserPromptSubmit 摘要凭据 | 在同一 Claude Code session 重新提交真实需求并从 `/harness` 恢复；无需提交完整 prompt |
| `EH-PROMPT-RECEIPT-155` | change 已绑定另一个用户请求摘要 | 检查 change/session 是否选错；新需求使用新的 change，不手改 binding |
| `EH-HOOK-BASH-MUTATION-157` | v6 主流程运行了 Bash 白名单外的命令、可调用外部程序的 Git/rg 配置、task-run，或包含管道、重定向、命令替换/解释器逃逸 | 主流程改用 Write/Edit；`rg` 显式使用 `--no-config`，Git 只用支持的 plumbing 查询；状态变更用 canonical runtime；实现阶段只由绑定 implementer 运行 task-run |
| `EH-HOOK-RUNTIME-INTEGRITY-158` | 工具尝试直接修改 git common-dir 协调数据 | 停止直接编辑 runtime coordination；用受支持的 hook/runtime 恢复路径 |
| `EH-STATE-LOCK-159` | 另一个存活进程正在原子获取或恢复同一锁，或 owner 不属于可验证的本机进程 | 等待当前短事务完成后重试；仅死亡的本机 owner 会自动隔离，foreign/unknown owner 必须运行 doctor 并人工确认共享存储状态，不手动抢占 |
| `EH-CLARIFY-ROUTE-148` | readiness items 无法派生可信 Clarify route | 重新运行 status，修复缺失、重复或未知状态的 item；不要在模型中猜测 route |
| `EH-STOP-FALLBACK-149` | Stop hook 无法完成 terminal fact-gate 机械格式校验 | 保留当前回复并重新触发 Stop；校验会 fail open，不能把该错误当成 lifecycle 通过证据 |
| `EH-DECISION-TARGET-106` | 同一 typed decision target 已有不可变选择 | 复用已有事件；若需求内容已形成新 revision，使用 runtime 生成的新 digest-versioned target，并重新 seal snapshot |
| `EH-QUESTION-TARGET-115` | 新问题试图再次询问已解决的 typed target | 停止重问并读取已有 DecisionEvent；只有真正的新 target 才能创建新候选问题 |
| `EH-CHANGE-TRANSACTION-150` | lifecycle 正在原子发布/重验阶段证据并推进 state | 等当前 transition 完成后重试写入；不要删除锁目录或绕过 runtime writer |
| `EH-TDD-RECEIPT-007` | v5 compatibility 流程缺少真实 TDD receipt | 仅在 v5 change 中用 tdd-run 执行冻结命令；v6 改用 task-run |
| `EH-COMPLETION-GATE-008` | 完成证据不足 | workflow status |
| `EH-AGENT-FAILURE-009` | agent 调用失败 | 修复后新 attempt |
| `EH-HOOK-SNAPSHOT-010` | Bash 快照缺失 | 重试同一受控命令 |
| `EH-HOOK-HEALTH-001` | SessionStart hook-health receipt 无效或无法写入 | 检查 sessionId、runtime common-dir 权限和 controller revision；修复后重新触发 SessionStart |
| `EH-HOOK-HEALTH-002` | 当前 session 没有 fresh SessionStart hook-health receipt，或 hook 未启用 | 重新打开会话触发 SessionStart；绑定 session 的阶段推进必须先恢复 fresh receipt；未绑定的 admin 流程只会显示 advisory，不能宣称 hooks enforced |
| `EH-TASK-RECEIPT-025` | implement task receipt 缺少策略要求的阶段、真实 argv 或 digest freshness | 按 `executionStrategy` 补齐 machine-generated receipt；TDD 必须有失败 RED，direct 必须记录 rationale，之后为每个 task 创建独立 review |
| `EH-HOOK-POST-WRITE-011` | 写入归因失败 | 查看 violation ledger |
| `EH-STATE-LOCK-012` | 同一状态文件正在被另一进程更新 | 等待当前写入完成后重试 |
| `EH-EVENT-ID-013` | append-only event 缺少幂等 ID | 通过 runtime 重新生成事件 |
| `EH-STATE-REVISION-014` | state revision 已变化 | 重新读取状态并重放当前决策 |
| `EH-STATE-V5-001` | active change 不是 State schema v5 或 v5 真相层不完整 | active v4 走显式转换/阻断；旧 archive 只读 |
| `EH-REWIND-001` | controlled rewind 目标不是上游 stage 或 stage 不存在 | 只回退到仍由 evidence 支持的上游 gate，不删除历史 evidence |
| `EH-SESSION-CONFLICT-001` | session 已绑定到另一个 change/worktree | 查看 `enterprise-harness sessions list`，使用新的 sessionId |
| `EH-SESSION-INPUT-001` | session binding 缺少 worktree 或 controller revision | 通过 `enterprise-harness sessions bind` 提供完整绑定信息 |
| `EH-SESSION-WORKTREE-001` | session binding 与当前 worktree/subject 不一致 | 在当前 worktree 使用对应 session，或重新 bind；不要跨 worktree 复用 session id |
| `EH-SESSION-AUTH-001` | session CLI 试图管理其他 session 或未绑定 session | 使用当前 sessionId，或显式设置本机受控 `ENTERPRISE_HARNESS_SESSION_ADMIN=true` |
| `EH-CHANGE-LOCK-001` | change 正被其他 session 写入 | 等待或结束持有锁的 session，不使用 last-write-wins |
| `EH-CHANGE-LOCK-002` | 非锁持有者尝试释放 change lock | 使用原 session 释放，或清理失效运行态后重试 |
| `EH-CHANGE-LOCK-003` | session 尚未绑定就尝试获取 change lock | 先用当前 session 绑定 change/worktree，再获取锁 |
| `EH-CHANGE-LOCK-004` | session 绑定的 change 与请求锁定的 change 不一致 | 只能由绑定到同一 change 的 session 获取锁 |
| `EH-CONTROLLER-SUBJECT-001` | controller 与 subject 指向同一根目录，或一方位于另一方内部 | 配置稳定 released controller，再治理 subject working tree |
| `EH-CONTROLLER-SUBJECT-002` | bootstrap 未配置独立 released controller | 设置 `ENTERPRISE_HARNESS_CONTROLLER_ROOT` 或由 plugin 提供的 `CLAUDE_PLUGIN_ROOT`，指向安装的 immutable controller，不要指向 subject/runtime |
| `EH-RESEARCH-PACKET-001` | research packet 缺事实、来源策略或 fallback 记录 | 重新生成统一 packet，不把 MCP 原文当编排指令 |
| `EH-MCP-POLICY-001` | MCP provider/capability 记录不符合统一策略 | 通过 mcp-policy 使用 codegraph/context7 capability alias |
| `EH-SESSION-CHANGE-001` | 当前 session 绑定的 change 与请求修改的 change 不一致 | 使用正确的 session，或先为目标 change 建立新的 session binding |
| `EH-WAIVER-001` | waiver 无效、未绑定 artifact digest，或缺少可信授权证据 | v6 当前对非空 waiver fail closed；不要用 `approvedBy` 字符串绕过 gate，先消除例外或等待受信授权制品支持 |
| `EH-ARCHIVE-FORCE-001` | `archive --force` 已删除 | 未完成 change 使用 `abandon <changeId> <reason>` |
| `EH-ARCHIVE-TRANSACTION-002` | archive 状态已推进但物理移动失败 | 修复 `harness/archive` 的目录类型或权限；runtime 会尝试 CAS 回滚为 active，若回滚也失败则先保留现场并人工恢复 state |
| `EH-ABANDON-001` | abandon 参数/生命周期无效 | 提供明确 reason，只对 active 未归档 change 执行 |
| `EH-ABANDON-TRANSACTION-002` | abandon 状态已写入但物理移动失败 | 修复归档目录后重试；runtime 会回滚 lifecycle 与 blocker，回滚失败时不要继续改写 change |
| `EH-PROJECT-PROFILE-001` | `harness/project.json` 缺少字段、格式无效或版本不支持 | 按 profile v1 补齐 language、build、productionRoots、testRoots 和 apiRoots |
| `EH-CLASSIFY-001` | classify 缺少有效 change 输入 | 提供当前 change 的 tier/impact 输入后重试 |
| `EH-VERIFY-TECP-015` | verify 无法渲染 TECPC 卡 | 检查 active change 状态结构 |
| `EH-POST-WRITE-TECP-016` | post-write 无法渲染 TECPC 卡 | 查看诊断后重新运行 status |
| `EH-HOOK-INPUT-017` | Claude Code hook 输入不是合法 JSON | 保留原始 hook 事件并重试 |
| `EH-HOOK-TECP-018` | hook 无法渲染 TECPC 卡 | 运行 status 检查状态 |
| `EH-LIFECYCLE-TECP-019` | lifecycle 无法渲染 TECPC 卡 | 校验 change state |
| `EH-SPAWN-DEPTH-020` | subagent 生成深度不足，forked 阶段会自写自审 | 设置 `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3` 后重启会话 |
| `EH-CODEGRAPH-INDEX-021` | CodeGraph 索引不可用，探索会退化成全量 grep | 在项目根运行 `codegraph init` |
| `EH-STATE-MUTATE-015` | v6 state mutator 不是函数或未返回对象 | 使用 runtime 的不可变 mutator 并返回完整 state |
| `EH-STATE-NOT-FOUND-016` | v6 mutation 找不到指定 change 的 state | 确认 changeId 已创建且仍为 active |
| `EH-STATE-V6-017` | 正在对 v4/v5 state 使用 v6 mutation | 先对 active v5 change 显式执行迁移；archive 保持只读 |
| `EH-STATE-SCHEMA-018` | v6 mutation 结果不满足 state schema | 修复 stage、artifacts 或 validation 字段后重试 |
| `EH-STATE-IDENTITY-019` | `state.changeId` 与 `harness/changes/<changeId>/state.json` 的路径身份不一致 | 不要复制或手改其他 change 的 state；恢复当前目录对应的 changeId，并通过受支持的 runtime mutation 更新状态 |
| `EH-V5-COMPAT-001` | behavior-checks.json not found; v0.5 uses harness/policy.json instead | 使用 handoff v2 创建 v6 change；v5 behavior registry 已不再支持 |
| `EH-V5-MIGRATE-CONFIRM-019` | active v5 change 尚未得到显式迁移确认 | 明确确认迁移；不要静默改写历史 state |
| `EH-V5-MIGRATE-020` | v5 migrator 收到的不是 schema v5 state | 使用相应兼容 reader/migrator，不要跨版本强迁移 |
| `EH-V5-MIGRATE-021` | 尝试迁移 archived 或非 active historical change | archive 只读；仅 active change 可迁移 |
| `EH-V5-MIGRATE-022` | 迁移后的 v6 state 不合法 | 修复源 state 的必要身份/classification 数据，再重试迁移 |
| `EH-V5-MIGRATE-023` | migration state path 不是 canonical `harness/changes/<changeId>/state.json` | 从 change 目录调用迁移；不要对任意 JSON 文件执行 state migration |
| `EH-CLASSIFICATION-SCHEMA-001` | classification artifact 缺失或 impact matrix 不合法 | 修复 `classification.json` 的五个 impact 维度后重新生成 digest reference |
| `EH-CLASSIFICATION-DIGEST-002` | state 中的 classification digest 与当前 artifact 不匹配 | 不要手改 artifact；重新执行 classification action 以更新 digest-bound reference |
| `EH-CLASSIFICATION-REFERENCE-003` | state 未指向该 change 的 canonical classification artifact | 将 reference 恢复为 `harness/changes/<changeId>/classification.json` 与合法 SHA-256 |
| `EH-CLASSIFICATION-READ-004` | digest-bound classification artifact 缺失 | 恢复或重新执行 classification，不能用 state projection 替代 artifact |
| `EH-CLASSIFICATION-AUTHORITY-005` | v6 workflow/status 缺少 canonical classification artifact reference | 重新执行 classification action 并让 state.artifacts.classification 指向当前 digest；不要从旧 impact projection 推断 |
| `EH-CLASSIFICATION-COMMIT-005` | classification artifact 更新与 state CAS 提交未能作为一个事务完成 | 保留 winning state，重新读取当前 revision 后重试 classification action；不要直接覆盖 classification.json |
| `EH-COMPLETION-PROOF-001` | executor/self-check/review/artifact digest 未形成有效 CompletionProof | 修复最早的 StageResult 或 ReviewResult 问题后重新运行独立 review |
| `EH-DESIGN-PROOF-001` | ArchitectureProof 缺失、无效、已过期、与现有文件冲突，或未精确绑定 fresh `design.produce` execute/review 链 | 修复 Design StageResult 与独立 passing ReviewResult 后运行 `enterprise-harness design seal-architecture <change-id>`；不要手工覆盖 proof |
| `EH-TRANSITION-001` | 请求了跳跃、回退或无效生命周期迁移 | 只沿 `clarify → design → plan → implement → verify → archive` 前进 |
| `EH-HANDOFF-STAGE-001` | v2 handoff 使用了非六阶段的 stage | 使用六阶段名称；`route` 和 `tdd` 仅供兼容 reader 读取 |
| `EH-PLAN-FINALIZE-001` | plan finalizer 的 handoff agent/role/stage 不匹配 | 创建 artifact-worker/plan 的 execute handoff |
| `EH-PLAN-FINALIZE-002` | 缺少 `tasks.md` | 先产出当前 change 的任务制品 |
| `EH-PLAN-FINALIZE-003` | task 形状、strategy、argv 或 recovery 不完整 | 修复冻结任务的必填节和未替换 placeholder |
| `EH-PLAN-FINALIZE-004` | plan StageResult 不符合运行时合同 | 依据 diagnostics 修复 result 输入或 evidence |
| `EH-IMPLEMENT-FINALIZE-001` | implement finalizer 的 handoff 不属于 implementer execute run | 创建 implementer/implement 的 execute handoff |
| `EH-IMPLEMENT-FINALIZE-002` | task receipt 不在当前 change 的 canonical evidence 路径 | 将 machine receipt 写入 `evidence/tasks/<taskId>.json` |
| `EH-IMPLEMENT-FINALIZE-003` | receipt 的 change/task/strategy/阶段链不完整，或输入 digest 不一致 | 修复 task 执行收据；TDD 的 RED 必须真实失败，后续阶段必须通过 |
| `EH-IMPLEMENT-FINALIZE-004` | implement StageResult 不符合运行时合同 | 修复 receipt/evidence 后重新 finalise |
| `EH-VERIFY-FINALIZE-001` | verify finalizer 的 handoff 不属于 verify execute run | 创建 artifact-worker/verify 的 execute handoff |
| `EH-VERIFY-FINALIZE-002` | 缺少 `validation.md` | 先运行冻结 validation 并写入报告 |
| `EH-VERIFY-FINALIZE-003` | validation 报告缺少命令、结果、新鲜度或例外记录 | 补全四个必填节并重新验证 |
| `EH-VERIFY-FINALIZE-004` | verify StageResult 不符合运行时合同 | 修复 evidence/result 后重新 finalise |
| `EH-ARCHIVE-FINALIZE-001` | archive finalizer 的 handoff 不匹配 | 创建 artifact-worker/archive 的 execute handoff |
| `EH-ARCHIVE-FINALIZE-002` | 缺少 validation 或 verify CompletionProof | 修复 verify evidence 后重新运行 archive self-check |
| `EH-ARCHIVE-FINALIZE-003` | verify CompletionProof 不是有效的 verify proof | 重新获得 fresh verify completion proof |
| `EH-ARCHIVE-FINALIZE-004` | archive StageResult 不符合运行时合同 | 修复 archive evidence 后重新 finalise |
| `EH-ARCHIVE-MANIFEST-001` | archive 输入、Verify CompletionProof、compound DesignProof 或 test-design 独立链不是当前 canonical closure | 回到 Verify/Design 修复最早报告的 stale/missing result、review、receipt 或 digest；由 archive finalizer 重建 manifest，不要手写或复用旧 manifest |
| `EH-ARCHIVE-MANIFEST-002` | archive manifest / runtime writer attestation 已存在但不构成当前 run 的同一 immutable pair | 不要手写、覆盖或移动任一证据；保留原 pair，并按受支持恢复流程创建新的 archive execution |
| `EH-ARCHIVE-MANIFEST-003` | manifest 已写入但 runtime writer attestation 无法以 immutable record 写入 | 不要手写 attestation；保留失败证据并按 archive recovery 创建新的执行，而不是尝试补造 receipt |
| `EH-VERIFY-RECEIPT-001` | Verify 的 TC coverage 缺失、unsupported、无理由 skipped，或不对应 accepted TC | 为每个 accepted TC 记录 executed/skipped 状态和明确理由；unsupported 不能通过，critical E2E 必须实际 executed |
| `EH-VERIFY-RECEIPT-002` | verification receipt 的 provenance、run、digest、路径或输入闭包无效/过期 | 使用当前 verify run 的 canonical task receipt 或 `evidence/verify/<runId>/` 实际证据；刷新 digest 后重跑 Verify |
| `EH-VERIFY-RECEIPT-003` | verification receipt 已存在，runtime 拒绝重复写入 | receipt 是 immutable；保留原 run evidence，需重试时创建新的 verify run |
| `EH-HANDOFF-V2-023` | handoff v2 role 非法 | 仅使用 `execute` 或 `check` |
| `EH-HANDOFF-V2-024` | handoff v2 缺 agent type 或 skill | 提供已声明的 agent type 与 skill |
| `EH-HANDOFF-V2-025` | handoff v2 缺 TECPC target | 明确写出本次执行的目标 |
| `EH-HANDOFF-V2-026` | checker handoff 未关联 executor run | 提供 parentRunId 并消费该 run 的 result artifact |
| `EH-HANDOFF-V2-027` | common-dir 中没有指定 handoff input | 确认 changeId/runId，重新创建 handoff |
| `EH-HANDOFF-V2-028` | handoff input 版本不匹配 | 通过对应 v1/v2 reader 读取，不要混用版本 |
| `EH-HANDOFF-V2-029` | Handoff v2 合同字段、角色关联或引用摘要不合法 | 重新创建符合 `harness/schemas/handoff-v2.schema.json` 的 handoff；check run 必须绑定不同的 executor runId，并刷新已变更的 input digest |
| `EH-HANDOFF-V2-030` | 待持久化的 StageResult 或 ReviewResult 与 Handoff v2 不匹配 | 修正 result 的 runId、stage、agent/skill、parentRunId、artifact digest 与 schema；review 前先持久化对应 executor result |
| `EH-HANDOFF-V2-031` | 尝试覆盖已持久化的 result evidence | 结果 evidence 不可覆盖；创建新的 execute/check run 并持久化新的 result |
| `EH-HANDOFF-V2-032` | Design check behavior 与其 parent execute behavior 不匹配 | architecture parent 只能创建 `design.review`；test-design parent 只能创建 `design.test-cases.review` |
| `EH-HANDOFF-V2-033` | Design check 没有使用对应 behavior 的 canonical rubric family | architecture review 使用 `design`，test-design review 使用 `test-design`，并按 canonical 顺序追加适用 risk rubrics |
| `EH-HANDOFF-AUTH-032` | subagent 尝试自行创建 reviewer check handoff | check run 只能由 Main/controller 创建；worker 返回 StageResult 后由 controller 派独立 reviewer |
| `EH-HANDOFF-AUTH-033` | 持久化 result 的 caller 未绑定到 exact run/role/session | 使用 handoff 派发的同一 agent 与 session 持久化结果；不要复用其他 run 的身份或在 worker 结束后补写 |
| `EH-V5-COMPAT-001` | v5 behavior-checks.json 不存在 | v0.5 使用 harness/policy.json；v5 handoff 需通过 runtime/compat/v5/ 适配 |
| `EH-SESSION-LEASE-023` | session lease 过期、不存在或已解绑 | 过期且 changeId 未变时重新运行 `start-change <same-change-id>` 幂等续租；冲突时先 `sessions show`，仅在明确放弃旧 binding 后执行 `sessions unbind`；不存在 `workflow clear-lease/abort` |
| `EH-SESSION-BINDING-024` | 当前 session 的 binding 文件存在但损坏或不符合 schema | 运行 `sessions unbind <session-id>` 明确放弃损坏 binding，再通过 `/harness` 重新绑定；不要把文件缺失或损坏伪装成未启用 Harness |
| `EH-STATE-READ-025` | session binding 或 legacy active change 指向的 `state.json` 无法读取、解析或迁移 | 运行 `doctor` 确认状态路径，从可信提交或备份恢复该 change 的 canonical `state.json`；不要删除 binding 来绕过治理 |
| `EH-CHANGE-LOCK-LEASE-024` | change lock 不存在，无法续约 | 先由绑定 session 获取 lock，再续约 |
| `EH-CODEGRAPH-INDEX-021` | CodeGraph 索引不可用，探索会退化成全量 grep | 在项目根运行 `codegraph init` |
| `EH-LOCAL-QUALITY-001` | 本地质量或发布子检查失败 | 查看其前一段带 `[local-quality]` 的失败阶段和原始 stderr，修复后重新运行 `npm run quality:local`；不要绕过 gate 发布 |
| `EH-RELEASE-001` | release 在首次远端写入前失败，或 main push 后无法确认远端状态 | 明确未写入时修复原始错误并重跑；若同时输出 `RECOVERY_WORKTREE`，先人工核对 origin/main，未确认前不得执行 tag/Release 发布命令 |
| `EH-RELEASE-SOURCE-002` | release tree 的 tracked diff 超出版本 allowlist，或质量 gate 修改了已提交源码 | 检查报告的文件；移除非版本投影变更，或修复会修改源码的 gate，再重新发布 |
| `EH-RELEASE-REMOTE-003` | `origin` 不是可解析的 GitHub 仓库 URL | 将 `remote.origin.url` 修正为该 marketplace 的 GitHub HTTPS/SSH URL，不要用另一个 `--repo` 绕过 |
| `EH-RELEASE-AUTH-004` | 当前 `gh` 账号对 origin 仓库没有发布权限 | 运行 `gh auth status`，切换到具有 write/maintain/admin 权限的账号后重试 |
| `EH-RELEASE-REMOTE-005` | 远端 main 或 tag 未指向本次 release commit | 停止创建 Release，核对 origin 和远端 refs；不要强推或覆盖不一致 tag |
| `EH-RELEASE-PARTIAL-002` | main 已可能写入远端，后续 tag 或 GitHub Release 发布失败 | 保留 `RECOVERY_WORKTREE`；若输出 `RECOVERY_TAG_ARGV` 先原样执行，再在该 worktree 中执行 `RECOVERY_RELEASE_ARGV`，成功后才清理 worktree |
| `EH-PATH-001` | ID、artifact reference 或 filesystem target 不安全 | 使用 repository-relative 非 symlink 路径和由字母数字、点、下划线、连字符组成的 safe identifier，修正后原样重试命令 |
| `EH-DECISION-SCHEMA-101` | 待追加的 Clarify decision event 不符合运行时合同 | 修正 event/change 绑定、选项、公开依据与 input digest 后重新追加 |
| `EH-DECISION-CONFLICT-102` | 同一 eventId 已对应不同内容 | 保留既有 append-only 事件，并为新决定分配新的 eventId |
| `EH-DECISION-LEDGER-103` | decision ledger 含无效 JSON、无效事件、重复 ID 或未终止行 | 从可信证据恢复完整的 newline-terminated JSONL；不要跳过损坏行 |
| `EH-DECISION-SNAPSHOT-104` | Clarify snapshot 或其有序账本前缀无效 | 修复 ledger，使 eventIds 成为精确有序前缀，再重新封存 |
| `EH-DECISION-SNAPSHOT-105` | 尝试覆盖已封存的 Clarify snapshot | 保留 immutable snapshot；需要新封存时使用新的 change/run artifact |
| `EH-QUESTION-CANDIDATE-106` | Clarify question candidate 缺失、JSON/schema 无效、change 身份不符或不在 canonical path | 重新生成并保存到 `harness/changes/<changeId>/evidence/clarify/questions/<questionId>.json`，再执行 `clarify prepare-question` |
| `EH-QUESTION-STALE-107` | candidate 本身或其 input digest 已过期 | 从当前 authoritative inputs 重新生成 candidate 和全部 input digests，再重新 prepare |
| `EH-QUESTION-ACTIVE-108` | 目标不是当前 active v6 change，或不处于 active `clarify` stage | 绑定正确的 active v6 change 并恢复到 `stage=clarify` 后重试，不手改 state projection |
| `EH-QUESTION-PENDING-110` | 已有一个未关闭的 authorized question，不能准备下一题 | 先按 status 的动作重问并 resolve，或运行 `enterprise-harness clarify recover <changeId>` 修复 crash window |
| `EH-QUESTION-PENDING-111` | pending question 缺失、损坏或已经 resolved，当前调用无可用授权 | 对 fresh canonical candidate 重新执行 `clarify prepare-question`；若文件损坏，先从可信运行态恢复再重试 |
| `EH-QUESTION-MISMATCH-112` | `AskUserQuestion` 输入与预授权 candidate 的精确投影不一致 | 原样重问 pending question，不修改问题、header、选项、description 或 `multiSelect` |
| `EH-QUESTION-ANSWER-113` | answer replay 与已记录选择冲突或 response shape 无效 | 使用 host 显示的 option label 作答；Other 会被脱敏记录并要求重新澄清，已记录事件不可改写 |
| `EH-QUESTION-RECOVERY-114` | pending state 与同一 candidate target 的 decision ledger 事件冲突 | 保留 append-only ledger，恢复与事件绑定一致的 candidate/pending evidence 后运行 `enterprise-harness clarify recover <changeId>` |
| `EH-QUESTION-INPUT-115` | `clarify` CLI 子命令或参数形状无效 | 运行 `enterprise-harness clarify --help`，按显示的 exact argv 重试；不要附加 rationale 或 chat 文本 |
| `EH-DECISION-STALE-146` | public decision event 的 evidence binding 缺失或已过期 | 从当前 authoritative inputs 重新生成 canonical event input 与全部 digests 后重试 |
| `EH-DECISION-INPUT-147` | public decision event input 缺失、无效或不是 canonical main/runtime event | 使用 `evidence/clarify/decision-events/<eventId>.json`；用户决策必须经 AskUserQuestion |
| `EH-LANE-INPUT-156` | lane applicability input 缺失、无效或路径不 canonical | 按模板重建 `evidence/clarify/lane-applicability-input.json`，绑定当前 requirements digest 后重试 |
| `EH-LANE-STALE-157` | lane applicability input 未绑定当前 requirements revision | 更新 canonical input 的 `requirementsDigest` 后重新运行 `clarify record-lanes` |
| `EH-LANE-CONTINUITY-158` | requirements 原始需求与 UserPromptSubmit continuity receipt 不一致 | 从绑定的原始用户请求恢复 requirements 原始需求段后重试 |
| `EH-LANE-DISPATCH-159` | research handoff 缺少当前 requirements revision 对应的 fresh lane DecisionEvent | 先运行 `clarify record-lanes`，回读 status 后再重试 handoff |
| `EH-CLASSIFICATION-INPUT-148` | classification input 缺失、无效或路径不 canonical | 重新生成 `evidence/clarify/classification-input.json` 并按当前 authoritative refs/digests 重试 |
| `EH-CLASSIFICATION-COMMIT-149` | classification 无法原子提交到 active v6 Clarify state | 恢复 active Clarify，解决 revision 冲突后重新运行 `clarify classify` |
| `EH-DEBT-SCHEMA-120` | Clarify technical-debt assessment 的结构、引用或 change 绑定无效 | 修正 canonical `debt-assessment.json` 中首个无效字段或引用后重新运行 `clarify validate-debt` |
| `EH-DEBT-DISPOSITION-121` | Relevant technical debt 没有恰好一个匹配的 durable disposition | 记录匹配 debtId、targetRef 和 status 的 `debt-disposition` event 后重新验证 assessment |
| `EH-DEBT-STALE-122` | Technical-debt assessment 或其 disposition decision 使用了缺失或过期输入 | 用当前 authoritative inputs 重新生成 debt assessment 和关联 decision 后再验证 |
| `EH-PROJECT-CONTRACT-SCHEMA-123` | Project-contract assessment 的结构、状态规则或 disposition event 无效 | 修正首个 status/event 不一致并重新运行 `clarify validate-project-contract` |
| `EH-PROJECT-CONTRACT-STALE-124` | Project instruction evidence 或 project-contract assessment 输入已过期 | 重新读取当前 instruction files、更新 digests，再重新验证 assessment |
| `EH-PROJECT-CONTRACT-SCOPE-125` | Project-contract assessment 试图引用不安全路径或携带 instruction write/apply payload | 删除 write/apply 字段并仅保留 repository-relative instruction evidence 后重试 |
| `EH-INSTALL-CONFLICT-003` | 安装目标已有非托管内容 | 查看 plan，备份后显式处理冲突 |
| `EH-INSTALL-GIT-001` | 目标仓库没有可用 Git HEAD | 初始化并提交目标仓库后重试 |
| `EH-INSTALL-MANIFEST-002` | 安装清单不合法或与目标不一致 | 恢复备份并重新执行安装计划 |
| `EH-EVIDENCE-POLICY-004` | 无法为目标 HEAD 生成 evidence policy | 修复 Git 状态后回滚并重装 |
| `EH-INSTALL-TARGET-005` | 安装目标路径无效或不可写 | 选择明确的仓库根目录 |
| `EH-STATUS-TECP-001` | status 卡片渲染失败 | 校验 state schema |
| `EH-SESSION-PROJECT-INFO-001` | project-info 无法解析 | 修复或重新生成 JSON |
| `EH-SESSION-TECP-002` | SessionStart 卡片渲染失败 | 运行 status 获取详细状态 |
| `EH-STOP-TECP-001` | Stop 卡片渲染失败 | 修复 state 后重试结束 |
| `EH-COMPLETION-STATE-101` | change 尚未 VALIDATED | 完成 verify |
| `EH-COMPLETION-IMPACT-102` | 影响面仍为 unknown | 回到 route 解析影响 |
| `EH-COMPLETION-FRESHNESS-103` | validation 已过期 | 重新验证 |
| `EH-COMPLETION-DIGEST-104` | artifact digest 不匹配 | 重新验证并封存 digest |
| `EH-COMPLETION-ARTIFACT-105` | artifact 状态不合法 | 修复报告的 artifact |
| `EH-COMPLETION-EVIDENCE-106` | change evidence 不完整 | 补齐 durable evidence |
| `EH-COMPLETION-REVIEW-107` | reviewer verdict 缺失或阻断 | 派独立 checker |
| `EH-COMPLETION-REVIEW-114` | task review 未绑定执行 receipt digest | 对照已导入 receipt 重新 review 并写入 receiptDigest |
| `EH-COMPLETION-POLICY-108` | evidence policy 不可用 | 在目标仓库初始化 policy |
| `EH-COMPLETION-TDD-109` | v5 compatibility TDD receipt 无效 | v5 用 tdd-run 重跑；v6 用 task-run 生成 canonical receipt |
| `EH-COMPLETION-LEDGER-110` | agent ledger 损坏 | 隔离损坏事件并重跑 |
| `EH-COMPLETION-VIOLATION-111` | ledger 有未解决违规 | 修复后创建新 run |
| `EH-COMPLETION-AGENT-112` | agent 缺少结束事件 | 完成或显式失败该 run |
| `EH-COMPLETION-API-113` | API 检查失败或 unsupported | 补齐可解析输入或配置专用 checker |
| `EH-COMPLETION-CLASSIFICATION-115` | v6 change 的 canonical classification artifact 缺失、失效或 digest 不匹配 | 修复 `classification.json` 与 state 中的 digest-bound reference；不要使用旧的 state impact projection 替代 |
| `EH-WORKFLOW-STAGE-GATE-007` | v6 Clarify→Design scope transition 被缺失或失效的 result gate 阻断 | 先修复 Clarify 的 structured StageResult / ReviewResult / digest freshness，再执行 `confirm-scope` |
| `EH-WORKFLOW-STAGE-GATE-008` | v6 Design→Plan 读取不到 fresh design gate 或 execution-readiness 被阻断 | 修复 Design StageResult / ReviewResult / digest freshness，再执行 `freeze-slice` |
| `EH-WORKFLOW-STAGE-GATE-009` | v6 Plan→Implement 读取不到 fresh plan gate | 修复 Plan StageResult / ReviewResult / digest freshness，再执行 `freeze-plan` |
| `EH-WORKFLOW-STAGE-GATE-010` | v6 Implement→Verify 读取不到 fresh implement gate | 修复 implement StageResult / ReviewResult / task receipts 后再执行 `enter-verify` |
| `EH-WORKFLOW-STAGE-GATE-011` | v6 Verify→Archive 读取不到 fresh verify gate | 修复 verify StageResult / ReviewResult / validation freshness 后再执行 `enter-archive` |

### 写受治理路径被 pre-write 阻断

写 `src/main/java`、`src/test/java` 或 `openapi` 时若 pre-write 提示「静态阶段链未通过验证
(missing-or-invalid-marker)」或「stage-evidence-digest-mismatch」：

```bash
# 缺失 marker：plan 冻结后还没验证过
enterprise-harness validate <change-id>

# digest 不匹配：阶段链证据（plan/reviews）已变化，重新验证
enterprise-harness validate <change-id>
```

`validate` 通过后写 `evidence/stage-gate.json`；之后 pre-write 只轻查该 marker 是否存在且
未过期，不再每次写文件全量重算阶段链。若改了 plan 或 reviews，marker 会自动失效，需重新
`validate`。

## Issue 最小信息

- 错误码和完整 recovery 行。
- `status --json` 的非敏感部分。
- 操作系统、Node、Java、Maven、Claude Code 和插件版本。
- changeId、taskId、runId。
- 预期行为、实际行为、最小复现。
