# Design 方法

设计输入由 `scripts/prepare-input.mjs` 冻结：已确认的 requirements、classification、impact 与 digest-bound research facts 是唯一事实来源。先将每个 requirement 映射到设计决策、边界、验证和回滚；没有事实支持的结论必须明确为假设或 `NEEDS_DECISION`。

API 与 Data 不是固定章节。仅当 `impact.api` 或 `impact.data` 为 `yes` 时，读取相应条件参考文件。设计必须覆盖受影响的架构边界、错误模型、兼容性、风险与可验证的验收路径。
