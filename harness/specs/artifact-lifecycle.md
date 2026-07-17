# Artifact 生命周期规范

## 目标

规定活动 change 资产从创建到验证再到归档的最小生命周期。

## 活动资产

活动 change 默认位于：

- `harness/changes/<change-id>/`

最小资产集合：

- `requirements.md`
- `state.json`
- `change.md`
- `validation.md`
- `evidence/`
- 视 tier 增加 `specs/`、`design.md`、`tasks.md`、`reviews/`

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
- 未满足 design gate（design.md + design-reviewer 非 block verdict + 可消费的 design approval）时，不得进入 plan / TASKED
- `tasks.md` 若仍为 draft header，或缺少可消费的 `plan-critic` verdict，不得进入 `TASKED`
- `EXECUTING` 必须绑定非空 `currentTask`
- 生产源码 / OpenAPI 写路径若缺少与当前 `currentTask` 对齐的 `RED_VERIFIED` 证据，不得放行
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
