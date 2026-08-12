---
name: harness-plan
description: plan 阶段：把 approved design 拆成精确 task，冻结 RED/GREEN/REFACTOR argv，通过独立 plan-critic。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness Plan

由 `/enterprise-harness:harness` 派发的 forked subagent，无用户对话通道。权威输入只有 change 目录的 durable artifact。

## Step 1: 产出 tasks

```bash
enterprise-harness handoff create <change-id> plan plan.produce execute
# subagent: enterprise-harness:plan-executor
```

每个 task 必须包含：

| 字段 | 说明 |
|------|------|
| `taskId` | `task-001`、`task-002`… |
| `goal` | 单一可测试目标 |
| `touchedFiles` | 精确路径列表 |
| `testFirst` | 先写的测试文件 |
| `redEvidence` | 具体断言描述（不接受"运行测试失败"） |
| `dependencies` | 前置 taskId 列表 |

`task-commands.json` 冻结格式（`spawnSync` 无 shell 执行）：

```json
{
  "task-001": {
    "red":      ["mvn", "test", "-pl", "module", "-Dtest=FooTest#testMethod"],
    "green":    ["mvn", "test", "-pl", "module", "-Dtest=FooTest#testMethod"],
    "refactor": ["mvn", "verify", "-pl", "module"]
  }
}
```

不接受自然语言命令；Java/Maven 必须符合 `harness/command-policy.json`。

▸ **Expect**: `tasks.md` + `task-commands.json` 写入，outputRefs 非空。

## Step 2: 独立 check

```bash
enterprise-harness handoff create <change-id> plan plan.produce check <executor-runId>
# subagent: enterprise-harness:plan-critic
```

▸ **Expect**: verdict=pass 或 advisory。block → 返工 plan.produce（新 run）。

## 完成

```bash
enterprise-harness workflow decide <change-id> freeze-plan
enterprise-harness validate <change-id>
```

▸ **Verify**: `workflow status <change-id>` 显示 stage=tdd，`planReady=true`。
▸ **Verify**: `evidence/stage-gate.json` 存在（pre-write hook 要求；漏跑 `validate` → tdd 首次写 BLOCK）。
