---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-09
implementationRefs:
  - .claude/skills/harness/SKILL.md
  - .claude/skills/harness-route/SKILL.md
  - runtime/lib/workflow.mjs
  - runtime/lib/workflow-audit.mjs
  - runtime/lib/status-summary.mjs
testRefs:
  - runtime/test/workflow-runner-smoke.mjs
  - runtime/test/route-stage-separation-smoke.mjs
  - runtime/test/workflow-status-audit-block-smoke.mjs
---

# Workflow Contract

唯一状态流：

```text
clarify → route → design → plan → tdd → verify → archive
```

## clarify

先派只读探索取得事实，再针对最低评分维度一次只问一个问题。七维评分和用户 scope confirmation 是 route 前置。

checker 是 `clarify-reviewer`，只审澄清质量（维度齐全、评分有依据、无未解决高风险歧义、scope 已确认），不做分流判断。

## route

route 是独立 gate，不是 clarify 的尾巴。clarify 回答“需求是什么”，route 回答“归谁、多大、需要谁复核”。

确定 tier、owning service/module/业务域、API/data/architecture/rule 影响、non-goals 和所需 reviewer。

- 前置：`clarifyReady` 与 `userConfirmedScope` 均为 true。
- executor：`route-decider`（与 clarify 的 `clarify-synthesizer` 分离）。
- checker：`requirement-reviewer` 独立复核分流决策，必须非 block。
- 四个 impact 维度不得留 `unknown`。
- 用户确认路由后由 `workflow decide <change-id> confirm-route` 写入 `routeReady=true`；
  design 在 `routeReady` 为 false 时不可进入。
- 恢复入口是 `/harness-route`，不复用 clarify 入口。

route 事实不足时返回 clarify，不用推测补齐。

## design

冻结适用的接口、错误、SQL/迁移、兼容性、架构和测试策略。独立 checker 必须 pass。

## plan

每个 task 冻结目标、范围、测试顺序、RED 点、exact argv 和验收。

## tdd

隔离 executor 完成 RED/GREEN/REFACTOR；独立 implementation checker 消费 result。

## verify

统一消费 state、artifact、review、receipt、ledger、API contract 和 validation freshness。

## archive

只有统一 completion predicate pass 才能物理移动 change 并清 active pointer。

阶段恢复读取 durable state 与已完成阶段的权威 evidence audit；聊天上下文不能替代。
对 schemaVersion 4 及以上的 strict change，任何已完成阶段 audit blocker 都优先于
`workflow.stage`、`nextEntry` 和 pending decision。`workflow status` 与普通 `status` 必须返回
`status=blocked`、隐藏阶段决策，并只推荐 `workflow audit <change-id> --json`；不得继续到投影阶段。
普通 `status` 的 `nextStage` 在阻断态必须为 null；原 state 阶段只能作为只读
`projectedStage` 暴露，不能被解释为恢复动作。
