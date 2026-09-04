# Implement 单 Task 执行方法

只执行 Handoff v2 指定的 `currentTask`。`HANDOFF_INPUT` 可以是 git common-dir 中的绝对 marker，
但 handoff 内所有 `inputRefs` 和 task path 一律相对当前 `pwd` 的隔离 worktree 解析；不得用 marker
所在目录推导仓库根，也不得读取或修改原 checkout 的同名路径。先读取当前 worktree 的 `state.json`、
`tasks.md`、`task-commands.json` 和 handoff 中其余冻结输入，不扫描其他 task 寻找“顺手修改”。若输入
缺失、摘要 stale、task 不一致、当前目录不是该 agent 的隔离 worktree，立即停止并把恢复动作交给 Main。

## 执行顺序

1. 从 `task-commands.json` 确认唯一 strategy、逐 phase literal argv、write scope、TC 映射和恢复方式。
2. 将 task 的最小行为变化映射到允许修改路径。只用 `Read` 读取已冻结输入和 `writeScope` 路径；
   不用 Grep/Glob/find 扩大探索。TDD 必须先用 `Write`/`Edit` 在范围内建立能证明目标行为缺失的测试；
   其他 strategy 不得伪造 RED。
3. 对当前 phase 单独运行 `task-run`。命令之间不得使用 `&&`、管道、重定向或外部 child argv。
4. TDD 的 RED 只有在项目命令成功启动、测试因预期行为缺失而非零退出时才成立；spawn error、环境错误、
   编译器不可用和错误测试选择器都不是 RED。
5. RED 后才用 `Write`/`Edit` 实施最小 GREEN；GREEN 通过后才做不改变行为的 REFACTOR。每一步都再次
   通过 runner 执行冻结 phase，不能直接调用 Maven/Gradle/npm 后手写结果。
6. 完整 phase chain 发布 canonical receipt 后，读取 [自检清单](self-check.md)，最后运行原子 finalizer。

## 停止与回退

- 冻结 argv 无法证明 task：停止并回 Plan，不在 Implement 临时换命令。
- write scope 不足或需要新依赖：停止并回 Plan 扩充合同。
- 发现业务选择、API/SQL 设计缺口：返回 `NEEDS_DECISION`，由 Main 路由到最早失效 gate。
- RED 原因不符合预期：修复测试或环境后创建新的 execute run；不得覆盖 canonical evidence。
- 当前 task 完成后停止。Main 负责独立 review、集成与选择下一个 task。
