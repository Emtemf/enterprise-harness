# Design 制品合同

权威输出是 `harness/changes/<change-id>/design.md`。必须使用 `assets/design.md.tmpl` 的稳定章节和 ID 体系，不能用聊天补足缺失内容。

## 必须表达的语义

- 每个 `R*` 都有一行 `R* → D* → E* → VO* → RB*` trace，且引用对象真实存在。
- 每个决定记录 Context、Decision、Consequences 和 Status；重要替代方案与舍弃理由可审计。
- component/service/interface 边界、依赖方向、事务所有权、成功与失败路径足以供 Plan 拆 Task。
- `impact.api=yes` 时 API 契约、错误、授权、幂等和兼容完整；`no` 时写 `N/A：理由`。
- `impact.data=yes` 时 SQL/schema、迁移、回填、事务和恢复点完整；`no` 时写 `N/A：理由`。
- 安全、并发、一致性、observability、技术债 disposition 和 `VO*` 可验证性义务按事实处置；每个 `VO*` 只描述可观察行为与主要失败信号。
- 未决业务选择必须是 `NEEDS_DECISION`，不能藏在 TBD、TODO 或假设里。

Design 不冻结 Task、具体实现模式、完整文件清单、exact argv 或详细测试用例；完整 `TC*`、测试数据、步骤和 E2E journey 由独立 `test-design` 基于 `VO*` 产生，Plan 再基于冻结输入安排执行。

## 完成证据

`artifact-shape` 证明章节和 impact 分支，`requirement-coverage` 证明 requirement 集合，`traceability` 证明逐条引用闭合。三者全部通过后才能生成 schema-valid StageResult；这仍不是 approval。
