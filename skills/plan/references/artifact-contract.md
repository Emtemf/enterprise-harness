# Plan 制品合同

Plan 只有一套由两个互相绑定的权威产物组成的执行计划：`tasks.md` 负责人类可审查的任务设计，
`task-commands.json` 负责 runtime 可执行的 strategy、phase、literal argv 与 write scope。二者的 task id、
strategy、`TC*` 和 Minimal RED case 必须完全一致，并由同一个 StageResult/ReviewResult 绑定。

每个 task 必须列出 `Test cases: TC*`；TDD task 必须列出 `Minimal RED case: TC*`。任何缺失、未知或 stale
的测试用例输入、缺失 task command freeze、空 argv、phase 顺序错误或不安全的相对路径均阻断 finalize。
每个 accepted `TC*` 至少被一个 task 消费；level 为 `migration` 的 accepted case 必须映射到包含
`DRY_RUN → APPLY → ROLLBACK` 的 migration task。
