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

receipt 必须记录 exact argv、exit code、时间、agent、worktree 和 digest。缺失时通常返回 `EH-TDD-RECEIPT-007`。

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

## 常见错误码

| 错误码 | 含义 | 恢复 |
|---|---|---|
| `EH-HANDOFF-INPUT-001` | 缺少 handoff input | 重新创建 handoff |
| `EH-HANDOFF-SCHEMA-002` | envelope 不合法 | 运行 handoff validate |
| `EH-AUDIT-HANDOFF-001` | 阶段缺少有效 executor `result.json` | 用对应 behavior 创建 execute handoff，派 executor 并确保 `HANDOFF_RESULT` 被 SubagentStop 持久化 |
| `EH-AUDIT-HANDOFF-002` | executor 没有绑定其 runId 的独立 checker pass/advisory | 用 executor runId 创建 check handoff，派 registry checker，保留 `check.json` |
| `EH-AUDIT-ARTIFACT-003` | 已完成阶段缺少必需 artifact | 运行 `workflow audit <change-id>` 定位文件，并回到该阶段以新 run 产出 |
| `EH-AUDIT-STATE-004` | state 投影不满足阶段完成谓词 | 不手改 state；补齐 evidence 后运行该阶段对应 lifecycle/workflow 命令 |
| `EH-AUDIT-STATE-005` | `workflow.stage` 非法，audit 不能确定所处阶段 | 运行 `workflow status --json` 对照 state schema；通过受支持的 workflow 决策恢复合法 stage，不手改投影 |
| `EH-AUDIT-RUNTIME-006` | status 无法完成 durable evidence audit | 运行 `workflow audit <change-id> --json`，修复首个无效 artifact/handoff 后重试 status |
| `EH-AGENT-BINDING-003` | dispatch/start/result 不一致 | trace runId |
| `EH-SUBAGENT-RESULT-004` | result 无法解析 | 按 skill schema 返回 |
| `EH-CHECKER-REQUIRED-005` | 缺少独立 checker | 创建 check handoff |
| `EH-CLARIFY-AMBIGUITY-006` | 歧义评分不足 | 补 weakest dimension |
| `EH-TDD-RECEIPT-007` | 缺少真实 TDD receipt | 用 tdd-run 执行冻结命令 |
| `EH-COMPLETION-GATE-008` | 完成证据不足 | workflow status |
| `EH-AGENT-FAILURE-009` | agent 调用失败 | 修复后新 attempt |
| `EH-HOOK-SNAPSHOT-010` | Bash 快照缺失 | 重试同一受控命令 |
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
| `EH-WAIVER-001` | waiver 无效、缺批准人或未绑定 artifact digest | 创建绑定当前 artifact digest 的结构化 waiver |
| `EH-ARCHIVE-FORCE-001` | `archive --force` 已删除 | 未完成 change 使用 `abandon <changeId> <reason>` |
| `EH-ABANDON-001` | abandon 参数/生命周期无效 | 提供明确 reason，只对 active 未归档 change 执行 |
| `EH-PROJECT-PROFILE-001` | `harness/project.json` 缺少字段、格式无效或版本不支持 | 按 profile v1 补齐 language、build、productionRoots、testRoots 和 apiRoots |
| `EH-CLASSIFY-001` | classify 缺少有效 change 输入 | 提供当前 change 的 tier/impact 输入后重试 |
| `EH-VERIFY-TECP-015` | verify 无法渲染 TECPC 卡 | 检查 active change 状态结构 |
| `EH-POST-WRITE-TECP-016` | post-write 无法渲染 TECPC 卡 | 查看诊断后重新运行 status |
| `EH-HOOK-INPUT-017` | Claude Code hook 输入不是合法 JSON | 保留原始 hook 事件并重试 |
| `EH-HOOK-TECP-018` | hook 无法渲染 TECPC 卡 | 运行 status 检查状态 |
| `EH-LIFECYCLE-TECP-019` | lifecycle 无法渲染 TECPC 卡 | 校验 change state |
| `EH-SPAWN-DEPTH-020` | subagent 生成深度不足，forked 阶段会自写自审 | 设置 `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3` 后重启会话 |
| `EH-CODEGRAPH-INDEX-021` | CodeGraph 索引不可用，探索会退化成全量 grep | 在项目根运行 `codegraph init` |
| `EH-PATH-001` | ID 或相对路径不安全 | 使用字母数字、点、下划线和连字符组成的 ID |
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
| `EH-COMPLETION-TDD-109` | TDD receipt 无效 | 用 tdd-run 重跑冻结命令 |
| `EH-COMPLETION-LEDGER-110` | agent ledger 损坏 | 隔离损坏事件并重跑 |
| `EH-COMPLETION-VIOLATION-111` | ledger 有未解决违规 | 修复后创建新 run |
| `EH-COMPLETION-AGENT-112` | agent 缺少结束事件 | 完成或显式失败该 run |
| `EH-COMPLETION-API-113` | API 检查失败或 unsupported | 补齐可解析输入或配置专用 checker |

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
