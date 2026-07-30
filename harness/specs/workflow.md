---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - .claude/skills/harness/SKILL.md
  - harness/plugin/runtime/lib/workflow.mjs
testRefs:
  - harness/plugin/runtime/test/workflow-runner-smoke.mjs
---

# Workflow Contract

唯一状态流：

```text
clarify → route → design → plan → tdd → verify → archive
```

## clarify

先派只读探索取得事实，再针对最低评分维度一次只问一个问题。七维评分和用户 scope confirmation 是 route 前置。

## route

确定 tier、API/data/architecture/rule 影响和所需 reviewer。

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

阶段恢复只读取 durable state；聊天上下文不能替代。
