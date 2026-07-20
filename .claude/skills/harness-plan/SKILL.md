---
name: harness-plan
description: >
  Clarify-first staged workflow 的 plan 阶段入口。用于在 design 已完成后，把设计拆成可机械执行的 `tasks.md`，明确 touched files、test-first order、RED/GREEN 证据点与 acceptance checks。适用于“进入 plan 阶段”“补 tasks”“让 plan-critic 可评审”等场景。
---

# Harness Plan

## 角色定位

本阶段默认以 **Fullstack Developer 视角**主导，并让 **Quality Engineer** 参与确认可测性与验收边界。

职责不是重复 design，而是：
- 把架构设计变成开发详细设计
- 明确 touched files / 实现顺序 / 失败测试入口
- 让下游执行者无需猜测即可进入 TDD


## 前置条件

进入本 skill 前，至少应满足：

- `design.md` 已存在
- design 已达到可评审状态
- 当前 change 的执行范围已锁定

## 必须产出

- `harness/changes/<change-id>/tasks.md`

## plan 必查项

1. touched files
2. implementation order
3. test-first order
4. RED evidence point
5. GREEN evidence point
6. refactor boundary
7. commands
8. acceptance checks

## 行为要求

- 先明确文件和顺序，再谈实现细节
- 不允许“实现时再想”的占位表述
- 必须显式给出 RED/GREEN 验证点
- 任务粒度要让 `plan-critic` 可以无猜测评审

## Gate Discipline

- plan/任务阶段同样不允许通过“继续”绕过 reviewer/gate
- 若 `plan-critic` 未通过或 plan 仍为 draft，不得直接进入 TDD

## 退出条件

- `tasks.md` 从 draft 收敛为正式 plan
- touched files / RED point / acceptance checks 已明确
- 能进入 plan review / TASKED 准备态
