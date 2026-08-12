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

- approved design + digest
- impact / reviewer requirements
- project command policy（`harness/command-policy.json`）

## 动作

1. 为每个 task 生成 task brief。
2. 创建 execute handoff，派 `plan-executor`：
   ```bash
   enterprise-harness handoff create <change-id> plan plan.produce execute
   ```
3. 等 `plan.produce/result.json`，以其 runId 创建 check handoff，派 `plan-critic`。
4. 只有 check.json verdict 为 pass 或 advisory 才可 `freeze-plan`。

## Task 必须包含的字段

每个 task 在 `tasks.md` 中需包含：

| 字段 | 说明 |
|------|------|
| taskId | 唯一标识，如 `task-001` |
| goal | 单一可测试目标 |
| touchedFiles | 精确文件路径列表 |
| testFirst | 必须先写的测试文件 |
| redEvidence | RED 断言描述（不接受"运行测试失败"） |
| dependencies | 前置 taskId 列表 |
| acceptance | 明确通过标准 |

## task-commands.json 冻结格式

```json
{
  "task-001": {
    "red":      ["mvn", "test", "-pl", "module", "-Dtest=FooTest#testBar"],
    "green":    ["mvn", "test", "-pl", "module", "-Dtest=FooTest#testBar"],
    "refactor": ["mvn", "verify", "-pl", "module"]
  }
}
```

- 数组元素是 exact argv，runner 以 `spawnSync` 无 shell 执行
- Java/Maven 必须符合 `harness/command-policy.json`
- 不接受自然语言命令描述

## 产出

- `tasks.md`（含所有 task brief）
- `task-commands.json`（冻结 red/green/refactor argv）
- `plan.produce` result.json + `plan-critic` check.json

## 阻断条件

- design 未 pass
- task 无具体测试或 RED 点
- 命令只写自然语言描述
- task 太大（单 task 超过1个原子变更）或顺序不明确
- checker block

## 下一阶段

plan pass 后，主 orchestrator 依次执行：

```bash
enterprise-harness workflow decide <change-id> freeze-plan
enterprise-harness validate <change-id>
```

第一条置 `planReady=true` 推进到 tdd；第二条验证静态阶段链并落 `evidence/stage-gate.json` marker。
pre-write hook 只查这个 marker，不每次重算阶段链。漏执行 `validate` 会导致 tdd 阶段首次写受治理路径被 block。
返工用 `revise-plan`。
