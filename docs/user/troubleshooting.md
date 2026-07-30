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

## 常见错误码

| 错误码 | 含义 | 恢复 |
|---|---|---|
| `EH-HANDOFF-INPUT-001` | 缺少 handoff input | 重新创建 handoff |
| `EH-HANDOFF-SCHEMA-002` | envelope 不合法 | 运行 handoff validate |
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
| `EH-VERIFY-TECP-015` | verify 无法渲染 TECPC 卡 | 检查 active change 状态结构 |
| `EH-POST-WRITE-TECP-016` | post-write 无法渲染 TECPC 卡 | 查看诊断后重新运行 status |
| `EH-HOOK-INPUT-017` | Claude Code hook 输入不是合法 JSON | 保留原始 hook 事件并重试 |
| `EH-HOOK-TECP-018` | hook 无法渲染 TECPC 卡 | 运行 status 检查状态 |
| `EH-LIFECYCLE-TECP-019` | lifecycle 无法渲染 TECPC 卡 | 校验 change state |
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
| `EH-COMPLETION-POLICY-108` | evidence policy 不可用 | 在目标仓库初始化 policy |
| `EH-COMPLETION-TDD-109` | TDD receipt 无效 | 用 tdd-run 重跑冻结命令 |
| `EH-COMPLETION-LEDGER-110` | agent ledger 损坏 | 隔离损坏事件并重跑 |
| `EH-COMPLETION-VIOLATION-111` | ledger 有未解决违规 | 修复后创建新 run |
| `EH-COMPLETION-AGENT-112` | agent 缺少结束事件 | 完成或显式失败该 run |
| `EH-COMPLETION-API-113` | API 检查失败或 unsupported | 补齐可解析输入或配置专用 checker |

## Issue 最小信息

- 错误码和完整 recovery 行。
- `status --json` 的非敏感部分。
- 操作系统、Node、Java、Maven、Claude Code 和插件版本。
- changeId、taskId、runId。
- 预期行为、实际行为、最小复现。
