---
name: plan
description: 冻结独立可执行、策略明确的实现任务列表。
user-invocable: false
context: fork
---

# Plan

将已 review 的 design 转换为独立 task：明确 target path、唯一的 `executionStrategy`、冻结的 exact argv、实现边界、review rubric、验证条件与恢复说明。新逻辑使用 `tdd`；已复现缺陷使用 `regression`；行为保持型重构使用 `characterization`；配置/文档使用 `direct`；可逆数据变更使用 `migration`；生成产物使用 `generation`。非 TDD strategy 不得强制 RED test。

## Quality loop

task plan 必须针对 design digest 完成 self-check，并在 implementation 前获得 independent review。design 变更会使 plan stale；范围缺失时返回 `NEEDS_DECISION`。