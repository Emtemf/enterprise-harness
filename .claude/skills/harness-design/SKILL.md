---
name: harness-design
description: >
  Clarify-first staged workflow 的 design 阶段入口。基于闭环五检 (TECP) 框架驱动设计产出：T 目标 → C 上下文 → E 证据 → P 路径。适用于"进入 design 阶段""补设计""让 design-reviewer 可评审"等场景。
---

# Harness Design（闭环五检驱动）

## 目标

本阶段默认以 **Principal Architect 视角**主导。

职责不是直接开始实现，而是：
- 用 TECP 四维组织设计产出
- 每个设计决策回答：T 目标是什么、C 上下文有什么约束、E 用什么证据支撑、P 为什么选这条路径
- 给开发和测试讲清楚方案，让 reviewer 可评审

## 前置条件

进入本 skill 前，至少应满足：

- 当前 change 已完成 `clarify`
- `requirements.md` 已记录 TECP 五维评分和最终路由
- final route 已形成
- 用户已确认执行范围

## 必须产出

- `harness/changes/<change-id>/design.md`

## TECP 设计必查项

### T 目标
- [ ] 业务目标明确
- [ ] 成功标准可验收

### C 上下文
- [ ] 基于代码探索的事实（不是猜测）
- [ ] 影响矩阵完整（Interface/Application/Domain/Infrastructure）
- [ ] 技术约束已记录

### E 证据
- [ ] 每个关键决策有证据来源
- [ ] 测试策略完整（Unit/Integration/E2E/RED）
- [ ] 验证命令已明确

### P 路径
- [ ] 方案对比表完整（选了什么、为什么不选其他的）
- [ ] 接口 / 数据 / 架构边界设计完整
- [ ] 风险与回滚策略
- [ ] P 纠正预案（设计偏差时怎么恢复）

## 行为要求

- 优先基于 `requirements.md`、`change.md`、目标项目 `CLAUDE.md` 与 exploration evidence 写 design
- 若仓库事实不足，先触发代码/文档探索，再补设计
- 设计不完整时不得直接跳到实现建议
- 需要 API 一致性时，应为 `api-consistency-reviewer` 留出可评审输入
- **每个设计决策必须标注证据来源**，不得出现"我觉得这样好"而无支撑

## Gate Discipline

- `design-reviewer` 属于强制 gate，不得提供“继续 / 跳过 review 直接进入 plan”的逃逸路径
- 若 design review 发现 blocker，必须停留在 design 阶段修正，而不是靠聊天确认跳过
- design-reviewer 必须检查 TECP 四维是否都有实质内容（不是占位符）

## 退出条件

- `design.md` TECP 四维 section 均已填写（非空、非占位符）
- 能明确进入 design review
- 不能以"实现时再补"替代设计缺口
