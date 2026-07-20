---
name: harness-design
description: >
  Clarify-first staged workflow 的 design 阶段入口。用于在 requirements 与 final route 已明确后，生成或完善 durable `design.md`，并强制覆盖接口、SQL/数据、架构边界、测试策略等企业设计检查项。适用于“进入 design 阶段”“补设计”“让 design-reviewer 可评审”等场景。
---

# Harness Design

## 角色定位

本阶段默认以 **Principal Architect 视角**主导。

职责不是直接开始实现，而是：
- 给开发和测试讲清楚方案
- 明确接口设计、表/数据设计、状态流与架构边界
- 把风险/回滚/测试策略讲成可评审设计


## 前置条件

进入本 skill 前，至少应满足：

- 当前 change 已完成 `clarify`
- final route 已形成
- 关键歧义已被记录或消解
- 用户已确认执行范围

## 必须产出

- `harness/changes/<change-id>/design.md`

## design 必查项

1. Problem / Goal
2. Scope / Non-goals
3. Affected modules
4. Interface contract
5. Data / SQL design
6. Flow / state changes
7. Architecture boundary
8. Risk / rollback
9. Test strategy

## 行为要求

- 优先基于 `requirements.md`、`change.md` 与 exploration evidence 写 design
- 若仓库事实不足，先触发代码/文档探索，再补设计
- 设计不完整时不得直接跳到实现建议
- 需要 API 一致性时，应为 `api-consistency-reviewer` 留出可评审输入

## 退出条件

- `design.md` 关键 section 已完整
- 能明确进入 design review
- 不能以“实现时再补”替代设计缺口
