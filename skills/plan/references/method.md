# Plan 方法

Plan 先消费摘要绑定的 `design.md`、`test-cases.md` 和 compound DesignProof，再按可独立交付、审查、
回滚和验证的结果拆分任务。不要按“controller/service/repository”机械分层；只有确有依赖时才排序，并在
前置条件中写明依赖的 observable output。

每个任务映射一个或多个 accepted `TC*`；TDD 任务还冻结属于自身映射的最小 RED case。`tasks.md`
描述目标、设计决定、模式选择或刻意不引入模式的理由、代码/SQL migration 影响、验收与回滚；
`task-commands.json` 使用 argv 数组冻结每个 strategy phase，并以 repo-relative write scope 限定修改面。

涉及数据库时，migration、rollback 和历史 SQL 文件必须进入独立可审查 task，不能把 SQL 只写在说明或
聊天中。涉及生成代码时，生成命令与生成后验证分别冻结为 `GENERATE` / `VERIFY`。

每个 accepted `TC*` 至少由一个 task 覆盖；Test Design 中 level 为 `migration` 的 accepted case 必须由
`migration` strategy task 消费，不能用 `direct` 的单次 VERIFY 冒充迁移的 DRY_RUN/APPLY/ROLLBACK 证据。
