# TECPC Isolated Handoff Scheme

## 目标

定义 Enterprise Harness 在 Claude Code plugin 中的上下文隔离、执行/检查接力、hook 覆盖与诊断合同。

本规范是 handoff 的长期真相源；`harness/behavior-checks.json` 是其 machine-readable 投影。

## 核心不变量

1. 主 `/enterprise-harness:harness` Skill 只负责人机交互、阶段判断、构造 handoff 和推进状态。
2. 每个受治理产出由 scoped executor subagent 在新上下文中执行，并通过 agent frontmatter `skills:` 预加载 `harness-stage-executor`。
3. 每个执行结果由另一个 scoped checker subagent 在不同的新上下文中检查，并预加载 `harness-stage-checker`。
4. executor 不得创建 checker。Claude Code subagent 不支持再派生 subagent，接力必须回到主 orchestrator。
5. `isolation: worktree` 是仓库修改隔离，不是上下文隔离；仅 TDD 写代码默认强制 worktree。
6. hook 不承担语义设计或总编排；hook 负责授权、schema、身份、digest、receipt、生命周期和完成态机械判断。

## 标准时序

```text
main orchestrator
  → handoff create(role=execute)
  → PreToolUse(Agent): 校验 input/agent/skill/behavior
  → executor subagent: fresh context + preloaded executor skill
  → SubagentStart: 登记 isolated lifecycle identity
  → SubagentStop: 校验并持久化 result.json
  → PostToolUse(Agent): 绑定 toolUseId/agentId/runId
  → handoff create(role=check, parentRunId=executor run)
  → checker subagent: another fresh context + preloaded checker skill
  → SubagentStop: 持久化 check.json/verdict
  → TaskCompleted/Stop: 累计校验
  → main orchestrator consumes compressed result
```

## Handoff Envelope

输入和结果都必须包含：

- `handoffVersion`
- `runId`
- `changeId`
- `stage`
- `behavior`
- `role`: `execute | check`
- `attempt`
- `parentRunId`: checker 指向 executor
- `agent.type`
- `agent.skill`
- `tecpc.target`
- `tecpc.evidence`
- `tecpc.context`
- `tecpc.path`
- `tecpc.correction`
- `inputRefs/inputDigests` 或 `outputRefs`
- `blockers`
- `summary`

checker 结果还必须包含 `verdict: pass | block | advisory`。

## Durable 落点

```text
harness/changes/<change-id>/runs/<run-id>/
├── input.json
├── result.json   # executor
└── check.json    # checker
```

跨 worktree 的临时 spool 仍可位于 git common dir，但必须被导入 durable change 资产后才能作为完成证据。

## Hook 覆盖

| 事件 | 机械职责 |
|---|---|
| `PreToolUse(Agent)` | 要求 `HANDOFF_INPUT`，校验 active change、agent、Skill、behavior |
| `SubagentStart` | 记录 session/agent/type/cwd |
| `PreToolUse` | 限制探索、写入和 TDD 行为 |
| `PostToolUse/Failure` | 记录成功绑定或稳定错误码 |
| `SubagentStop` | 校验 result envelope，持久化 result/check |
| `TaskCompleted` | 要求最近 governed execution 已被独立 checker 接受 |
| `Stop` | 复用累计 completion predicate，给出恢复入口 |
| `WorktreeCreate` | 固定 mutating executor 的安全基线 |

关键 hook 必须配置在 plugin `hooks/hooks.json`。不能依赖 plugin agent frontmatter 中的 agent-local hooks。

## 可诊断性

稳定错误码定义在 `harness/plugin/runtime/lib/diagnostics.mjs`。用户报告问题时优先提供：

- error code
- changeId
- runId

定位命令：

```bash
enterprise-harness handoff explain <error-code>
enterprise-harness trace <run-id> [change-id]
enterprise-harness handoff validate <input-path> [result-path]
enterprise-harness doctor
```

创建 execute handoff 时应通过重复的 `--input-ref <path>` 传入最小 brief/context packet；runtime
会记录 digest。输入在派发前变化会以 stale handoff 阻断。checker handoff 的 `parentRunId` 会
自动把 executor `result.json` 纳入 `inputRefs`。

插件只诊断自身可观察的安装、配置、事件、资产和证据问题，不检查或治理 Claude 账户容量、订阅配额或用户账户状态。
