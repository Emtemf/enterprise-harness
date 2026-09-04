# Implement 单 Task 自检

finalizer 前逐项核对，任一项不能由 durable evidence 证明时停止：

- 当前 `state.stage=implement` 且 `currentTask` 与 handoff/taskId 一致。
- handoff 的全部 input digest 仍 fresh；未改变冻结的 `tasks.md`、`task-commands.json` 或设计输入。
- 只执行 task 冻结的 strategy 与 phase 顺序；receipt 中 exact argv 与冻结值一致。
- TDD RED 的非零退出来自目标断言失败，不是 spawn、权限、依赖、编译或环境故障。
- GREEN/REFACTOR（或对应非 TDD 成功 phase）exit code 为零，没有 skip/unsupported 冒充 pass。
- changed paths 全部处于 write scope；未安装计划外依赖，未修改历史 SQL 或其他 task 路径。
- 实现覆盖 task 的 R/D/VO/TC 映射，且是最小可审查变化；恢复/rollback 仍可执行。
- canonical receipt 与当前 run spool 完全相同，并绑定当前 worktree、HEAD/tree 快照和输入摘要。
- 下游坑点清单的 Implement 项均未命中，或已经以 evidence ref 纠正。
- 未自行批准实现；输出只结束 execute run，独立 task review 仍由 Main 派发。
