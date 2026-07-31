---
name: harness-plan
description: Enterprise Harness plan 阶段。把 approved design 拆成可独立执行、真实测试和精确命令冻结的 task，并要求独立 plan checker。
---

# Harness Plan

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

## 输入

- approved design 和 digest
- impact/reviewer requirements
- project command policy

## 动作

1. 为每个 task 生成 task brief。
2. 派 `plan-executor` 生成：
   - taskId 和目标
   - touched files
   - test-first order
   - RED/GREEN evidence point
   - dependencies
   - acceptance
3. 在 `task-commands.json` 冻结每个 task 的 red/green/refactor 或 verify exact argv。
4. Maven argv 必须符合 `harness/command-policy.json`。
5. 派 `plan-critic` 独立检查可执行性和遗漏。

## 产出

- `tasks.md`
- task briefs
- `task-commands.json`
- plan checker verdict

## 阻断

- design 未 pass
- task 无具体测试或 RED 点
- 命令只写自然语言
- task 太大或顺序不明确
- checker block

## 下一阶段

plan pass 后进入 tdd。
