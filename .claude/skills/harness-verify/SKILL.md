---
name: harness-verify
description: >
  Clarify-first staged workflow 的 verify 阶段入口。用于在实现后统一消费 reviewer verdict、validation freshness、命令证据与 skipped items，判断当前 change 是否可宣称完成。适用于“进入 verify 阶段”“补 validation”“刷新 freshness”“准备结束 change”等场景。
---

# Harness Verify

## 目标

在宣称完成前，用统一的 reviewer + evidence + freshness contract 收口，而不是只跑零散命令。

## 前置条件

进入本 skill 前，至少应满足：

- 当前任务已完成 TDD 子状态推进
- `validation.md` 可更新
- reviewer verdict 可被引用或补齐

## 必须产出

- `harness/changes/<change-id>/validation.md`
- `harness/changes/<change-id>/reviews/*.json`

## verify 必查项

1. ran commands
2. key outputs
3. skipped items
4. reviewer verdicts
5. stage gate summary
6. freshness status
7. final verdict

## 行为要求

- blocking reviewer verdict 不能被忽略
- stale validation 不能宣称完成
- 失败/重试/跳过项必须显式写入
- Stop hook 只是兜底；主 verify 阶段应先完成自我收口

## 退出条件

- `validation.md` 完整
- reviewer verdict 已落盘
- 当前 change 的完成声明有 fresh evidence 支撑
