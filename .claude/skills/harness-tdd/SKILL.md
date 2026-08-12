---
name: harness-tdd
description: tdd 阶段：派 tdd-executor 执行冻结 RED/GREEN/REFACTOR，导入 receipt，派 implementation-reviewer。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness TDD

由 `/enterprise-harness:harness` 派发的 forked subagent，无用户对话通道。权威输入只有 change 目录的 durable artifact。

## 按需 reference

- 创建 `tdd.execute-task` handoff：读 `../harness/reference/behavior-map.md`
- executor 输出：读 `../harness/reference/protocol/executor-result-contract.md`；最小示例读 `../harness/reference/protocol/executor-minimal.md`
- implementation review：读 `../harness/reference/protocol/checker-verdict-contract.md`；verdict 示例读 `../harness/reference/protocol/checker-verdicts.md`
- `enter-verify` 前：读 `../harness/reference/stage-decisions.md`

## 前置

```bash
enterprise-harness validate <change-id>   # stage-gate marker 必须 fresh
```

▸ 缺失时先跑；否则 tdd 写受治理路径 BLOCK。

## Step 1: 创建 execute handoff

```bash
enterprise-harness handoff create <change-id> tdd tdd.execute-task execute
```

▸ **Expect**: 输出 `HANDOFF_INPUT=harness/changes/<id>/runs/<runId>/input.json`。

## Step 2: 派 tdd-executor（worktree 隔离）

subagent_type: `enterprise-harness:tdd-executor`，prompt 原样含 `HANDOFF_INPUT=<path>` 行。

executor 依次运行冻结命令：

```bash
enterprise-harness tdd-run <change-id> <taskId> red      -- <frozen argv>
enterprise-harness tdd-run <change-id> <taskId> green    -- <frozen argv>
enterprise-harness tdd-run <change-id> <taskId> refactor -- <frozen argv>
```

| 步骤 | exit 要求 | 失败时 |
|------|-----------|-------|
| RED | **非零**（真实断言失败） | 检查测试是否命中目标类/方法 |
| GREEN | **零** | 修实现，不改冻结 argv |
| REFACTOR | **零** | 只重构，不加新功能 |

executor 末尾输出（few-shot）：

```
ENTERPRISE_HARNESS_HANDOFF_RESULT
{"runId":"<id>","stage":"tdd","behavior":"tdd.execute-task","role":"execute",
 "tecpc":{"target":"...","evidence":[...],"context":[...],"path":"...","correction":"..."},
 "outputRefs":["harness/changes/<id>/evidence/tdd/<taskId>.json"],"blockers":[],"summary":"..."}
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```

▸ **Expect**: receipt 存在，outputRefs 非空，blockers=[]。

## Step 3: 集成 + 导入 receipt

```bash
enterprise-harness evidence-import <change-id> <taskId>
```

▸ **Verify**: `harness/changes/<id>/evidence/tdd/<taskId>.json` 已写入。

## Step 4: 独立 review

```bash
enterprise-harness handoff create <change-id> tdd tdd.execute-task check <executor-runId>
# subagent: enterprise-harness:implementation-reviewer
```

▸ **Expect**: verdict=pass。block → 返工（新 run）。

## 所有 task 通过后

```bash
enterprise-harness workflow decide <change-id> enter-verify
```

▸ **Verify**: `workflow status <change-id>` 显示 stage=verify，`tddStatus=refactor-verified`。
