# Design 制品合同

输出为 change 目录的 `design.md`。它至少包含：目标与验收、事实与约束、决策与证据、架构边界、测试与验证、风险与回滚。

每个稳定 requirement identifier（例如 `R1`）必须在设计中出现，并能追溯到至少一个决策与证据。不要以审批词、worker 对话或主观自评代替制品内容。完成时通过 `scripts/finalize-result.mjs` 生成 schema-valid `StageResult`。
