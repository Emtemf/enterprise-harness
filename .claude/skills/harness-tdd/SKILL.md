---
name: harness-tdd
description: >
  Clarify-first staged workflow 的 TDD 执行阶段入口。用于在 plan 已明确后，严格执行 TEST_WRITTEN -> RED_VERIFIED -> GREEN_VERIFIED -> REFACTOR_VERIFIED，并保留 durable evidence。适用于“按 TDD 开始执行”“验证 RED/GREEN/REFACTOR”“准备进入 verify 阶段”等场景。
---

# Harness TDD

## 角色定位

本阶段默认以 **Fullstack Developer 视角**主导，并让 **Quality Engineer** 参与验证 RED/GREEN/REFACTOR 证据。

重点不是“写点测试”，而是让开发与测试围绕同一组证据推进实现。


## 前置条件

进入本 skill 前，至少应满足：

- `tasks.md` 已准备好
- touched files 与 test-first order 已明确
- 当前 change 已达到可执行准备态

## TDD 子状态

```text
TEST_WRITTEN
→ RED_VERIFIED
→ GREEN_VERIFIED
→ REFACTOR_VERIFIED
```

## 核心规则

- 没有 RED 证据，不得修改生产代码
- 没有 GREEN 证据，不得宣称实现完成
- REFACTOR 只能在全绿后进行
- 所有阶段都必须留下可进入 `validation.md` 的命令与结果摘要

## 行为要求

- 先写失败测试，再执行 RED
- GREEN 仅做最小实现
- REFACTOR 后必须重新确认全绿
- 必要时可调用专职 worker，但主上下文必须保留当前任务与证据点摘要

## 退出条件

- 已达到 `REFACTOR_VERIFIED`
- 当前 task 的验证证据可被 `verify` 阶段消费
- 未完成项或失败项已显式记录
