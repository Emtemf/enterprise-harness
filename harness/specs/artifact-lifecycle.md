# Artifact 生命周期规范

## 目标

规定活动 change 资产从创建到验证再到归档的最小生命周期。

## 活动资产

活动 change 默认位于：

- `harness/changes/<change-id>/`

最小资产集合：

- `state.json`
- `change.md`
- `validation.md`
- 视 tier 增加 `specs/`、`design.md`、`tasks.md`

## 生命周期

```text
DRAFT
→ DISCOVERED
→ CHANGE_APPROVED
→ SPECIFIED
→ DESIGN_APPROVED
→ TASKED
→ EXECUTING
→ REVIEWED
→ VALIDATED
→ ARCHIVED
```

## 关键门禁

- 未完成最小探索，不得进入 final route
- design 未批准，不得进入 plan
- RED 未验证，不得修改生产源码
- validation 缺失或 stale，不得声称完成
- archive 后不得继续直接编辑原目录

## 归档原则

- 活动 change 完成后进入 archive
- archive 只保存冻结历史，不作为继续编辑场所
- 稳定真相应提升到 `harness/specs/` 或 `.claude/rules/`

## 当前阶段说明

本规范先提供骨架语义，后续会继续补充：

- verdict schema
- digest 规则
- stale 判定
- CI 对齐
