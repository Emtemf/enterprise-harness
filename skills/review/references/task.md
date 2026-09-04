# Task rubric

独立检查一个 Implement task 的冻结合同、真实执行、代码变化和恢复边界。不能只看到 receipt schema 合法
就通过；也不能把 implementer transcript、自检或 worktree 隔离当作 reviewer 独立性。

## 必查项

- `state.currentTask`、execute handoff、`tasks.md` 与 `task-commands.json` 指向同一个稳定 taskId，全部输入摘要 fresh。
- strategy、phase chain、literal argv、write scope、R/D/VO/TC 映射和 recovery 与冻结 Plan 一致。
- canonical receipt 来自 `runtime-runner`，与 execute run spool、implementer identity、隔离 worktree、git common dir、
  HEAD/tree 快照和 changed paths 完整绑定。
- 逐 phase exit code 符合 strategy；TDD RED 是目标断言失败，不是 spawn、环境、依赖或编译故障，后续成功 phase
  为零。stdout/stderr digest 只能证明输出未被改写，reviewer 仍须检查可观察失败/成功原因。
- 从 receipt 指向的 worktree 阅读实际 diff 与测试；changed paths 不越界，代码是满足当前 task 的最小实现，
  没有隐藏依赖、历史 SQL 改写、无关重构或下一 task 的内容。
- 实现与 Design 的 API、SQL/数据、服务交互、错误/并发/安全和兼容约束一致；已映射 TC 的断言确实覆盖目标行为。
- recovery/rollback 可执行，失败不会留下无法识别的部分状态；发现冻结合同不足时回到最早失效 gate。
- StageResult 只绑定 canonical receipt，finalizer 已原子持久化；当前 reviewer run 与 execute run、agent identity 不同。

只有以上项目都可由冻结输入、代码 diff 和 durable evidence 证明时才返回 `pass`。否则返回 `block`，
correction 必须指出最早失效 gate、具体证据与可执行恢复动作。
