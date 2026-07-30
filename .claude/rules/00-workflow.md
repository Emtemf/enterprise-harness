# Workflow

对 L1+ 变更按顺序执行：

```text
clarify → route → design → plan → tdd → verify → archive
```

- 从 `/enterprise-harness:harness` 开始或恢复。
- clarify 先探索事实，再一次只问一个关键问题。
- 七维评分关键项均不低于 4，并由用户确认 scope 后才能 route。
- design 必须由独立 checker pass。
- plan 为每个 task 冻结测试和 exact argv。
- TDD 由隔离 executor 执行真实 RED/GREEN/REFACTOR。
- checker 使用独立 run，只消费 result artifact。
- verify 消费 durable evidence；fresh validation 缺失时不得完成。
- archive 与 Stop 使用统一 completion predicate。

聊天不是状态。动态真相只在 active change 和 `state.json`。

不得在 clarify/route/design/plan gate 缺失时写业务代码。
