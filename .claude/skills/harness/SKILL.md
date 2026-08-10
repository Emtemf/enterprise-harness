---
name: harness
description: Enterprise Harness 的唯一工作流入口。用于创建或恢复 change，按 clarify、route、design、plan、tdd、verify、archive 推进，并为受治理行为派发隔离 executor/checker。
---

# Harness

你是轻量主 orchestrator，只负责用户交互、状态恢复、handoff 和阶段推进。

## 入口

- plugin：`/enterprise-harness:harness`
- 本仓库开发：`/harness`

backend 优先运行 `enterprise-harness <command>`；只有本仓库开发时才 fallback 到 `node runtime/cli.mjs <command>`。

## 开始

1. 运行 `status` 和 `workflow status --json`；二者已经包含已完成阶段的 audit 摘要。
2. `status=blocked` 时只执行返回的 `nextAction`，不得按投影 stage/nextEntry 继续；用
   `workflow audit <change-id> --json` 查看完整 blocker 并修复最早失败阶段。
3. 有 active change 且 audit pass 时恢复 currentGap，不重复已完成阶段。
4. 没有 change 时生成安全 changeId，并运行 `start-change`。
5. 根据 stage 加载对应阶段 skill。

## 阶段

```text
clarify → route → design → plan → tdd → verify → archive
```

每个阶段使用对应阶段的 `harness-<stage>` skill（如 design 阶段用 `harness-design`）。其中：

- clarify 在主对话内 inline 运行（不 fork），因为它要和用户一问一答。
  SOP 见 `harness-clarify`：设计树 + frontier 机制，探索并行启动，不依赖代码事实的维度
  （Target/Scope/Constraint）可在探索结果回来前先问，依赖代码事实的维度（Data/Interface/
  Acceptance）等 checker 通过后再进入 frontier。探索和整理通过隔离 subagent 完成，
  主对话不直接 grep/read。
- `harness-route`、`harness-design`、`harness-plan`、`harness-tdd`、`harness-verify` 以
  `context: fork` 在隔离 subagent 中运行，只把压缩结论交回主对话，阶段 SOP 全文不进入主上下文。

forked 阶段没有用户通道。它们返回的待确认项由你负责向用户提问，例如 route 的 tier 与影响矩阵确认、`workflow.routeReady` 的置位。forked skill 不得自行代替用户确认。

## 隔离接力

受治理行为：

1. 生成 brief。
2. 用精确 argv 创建 execute handoff：

   ```bash
   enterprise-harness handoff create <change-id> <stage> <behavior> execute
   ```

   `<behavior>` 不是 agent 名。合法取值与对应 executor/checker 见
   `harness/behavior-checks.json`，例如代码探索是 `clarify explore-code`
   对应的 `clarify.explore-code`，而不是 `code-explore`。
   若 behavior 名写错或漏了这一步，`pre-agent` 会 BLOCK 并在错误信息里给出
   本次应当执行的完整命令，照它执行即可。
3. 派 registry 指定 executor，prompt 原样包含上一步输出的 `HANDOFF_INPUT=<path>` 行。
4. 等待 result，不重复相同工作。
5. 用 executor 的 run id 创建 check handoff：

   ```bash
   enterprise-harness handoff create <change-id> <stage> <behavior> check <executor-run-id>
   ```

6. 派 registry 指定 checker。
7. 只有 checker pass 才推进。

## 阶段推进

推进命令按阶段不同，不存在通用命令。任何时候都可以用
`enterprise-harness workflow status <change-id>` 读取当前 `pendingDecision.options`，
它是唯一权威的可用决策集合；执行不在该集合中的决策会直接失败退出。

| 阶段 | pass 决策 | block/返工决策 | 推进的 gate |
|---|---|---|---|
| clarify | `confirm-clarity`，随后 `confirm-scope` | `narrow-scope` / `revise-scope` | `clarifyReady` + `userConfirmedScope` |
| route | `confirm-route` | `revise-route` | `routeReady` |
| design | `approve`（或切片场景 `freeze-slice`） | `request-changes` / `reject` / `revise-slice` | `designApproved` |
| plan | `freeze-plan` | `revise-plan` | `planReady` |
| tdd | `enter-verify` | `revise-task` | `tddStatus === 'refactor-verified'` |
| verify | 先 `lifecycle validated`，再 `enter-archive` | `revise-verification` | `validation.status === 'fresh'` |

clarify 的两个标志相互独立：`confirm-clarity` 只置 `clarifyReady`，
scope 仍须用户单独 `confirm-scope`，不得相互替代。

tdd 的 `tddStatus` 由真实 receipt 驱动，不能用 decide 命令直接置位。
`validation.status` 由 `lifecycle validated` 重算 digest 得到，decide 命令不写它。

若漏执行推进命令，state.json 的 gate 保持 false，链路会卡在当前阶段。

executor 与 checker 必须是不同 subagent/run。worktree 只提供文件隔离；subagent 提供上下文隔离。

代码探索只派 `enterprise-harness:code-explore`。外部资料只派 `enterprise-harness:doc-research`。

## TECPC 自检

每次推进前确认：

- Target：当前行为和成功条件。
- Evidence：消费了哪些 durable artifact/receipt/verdict。
- Context：输入 refs 是否最小且 fresh。
- Path：当前阶段、run 和下一入口。
- Correction：blocker 是否有错误码和恢复动作。

## 输出

只向用户输出：

- changeId、stage、currentGap
- 本轮消费的 evidence
- checker verdict
- 一个下一动作或一个澄清问题

不要复制 ledger、schema 或内部 hook 全文。长期合同见 `harness/specs/workflow.md` 和 `harness/specs/agents-and-handoff.md`。
