---
name: harness-plan
description: Enterprise Harness plan 阶段。把 approved design 拆成可独立执行、真实测试和精确命令冻结的 task，并要求独立 plan checker。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness Plan

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

## 上下文边界

你在 forked subagent 中运行，没有主会话历史，也没有和用户对话的通道。

- 权威输入只有 change 目录里的 durable artifact，不是聊天记录。
- 需要用户决策时在 blockers 里写明，交主 orchestrator 去问。
- 你仍可派 executor 和 checker subagent，这是本阶段的核心要求。
- 返回给主 orchestrator 的是压缩结论，不是 tasks 全文。

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

plan pass 后，主 orchestrator 必须执行：
```bash
enterprise-harness workflow decide <change-id> freeze-slice
```
此命令将 `planReady` 置 true 并推进到 tdd 阶段。若漏执行，state.json 的 gate 保持 false，链路会卡在 plan。
