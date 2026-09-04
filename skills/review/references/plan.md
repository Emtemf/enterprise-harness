# Plan rubric

逐 task 检查以下项目，任一未处置 finding 都必须 block：

- `tasks.md` 与 `task-commands.json` 的 task id、strategy、accepted `TC*`、最小 RED case 完全一致；
- 任务按可独立交付的行为切片，不按 controller/service/repository 机械分层，并声明真实依赖的 observable output；
- 每个任务追踪批准的 R/D/VO、具体修改/新增/测试路径、模式选择或不引入模式的理由、验收和恢复；
- strategy 对应完整且有序的 phase，所有命令为 literal argv；write scope 最小、repo-relative，且不覆盖其他 task；
- 数据变更拥有独立 migration task、历史 SQL 路径以及 DRY_RUN/APPLY/ROLLBACK；生成任务拥有 GENERATE/VERIFY；
- 所有 accepted `TC*` 至少被一个任务覆盖，critical 路径不会被拆散到无法独立验证的任务；
- 不存在占位、隐藏业务决策、产品代码修改、自批或越界到 Implement/Verify 的执行结果。
