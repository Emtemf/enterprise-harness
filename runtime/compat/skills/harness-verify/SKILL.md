---
name: harness-verify
description: verify 阶段：消费所有 reviewer verdict + TDD receipt + fresh validation，给出 completion verdict。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness Verify

由 `/enterprise-harness:harness` 派发的 forked subagent，无用户对话通道。权威输入只有 durable artifact、receipt、ledger。

## 按需 reference

- 创建 `verify.collect` / `verify.check-api` handoff：读 `../harness/reference/behavior-map.md`
- checker 输出：读 `../harness/reference/protocol/checker-verdict-contract.md`；pass/block/advisory 示例读 `../harness/reference/protocol/checker-verdicts.md`
- 进入 archive 前：读 `../harness/reference/stage-decisions.md`

## 开始前：完成态检查清单

```bash
enterprise-harness workflow status <change-id>   # 查当前缺口
```

逐项确认（未满足的在 blockers 里写明，交主 orchestrator 处理）：

- [ ] design-reviewer verdict: pass
- [ ] plan-critic verdict: pass
- [ ] implementation-reviewer verdict: pass（每个 task）
- [ ] `evidence/tdd/<taskId>.json` 全部存在
- [ ] validation.status: fresh（必须由 `lifecycle validated` 重算）
- [ ] api-consistency-reviewer verdict: pass（有 API 变化时）

有未满足项时，返回 `NEEDS_DECISION` 给主 Harness：

```text
NEEDS_DECISION
- question: <唯一需要用户裁定的 blocker>
- options: 返回上一阶段补齐证据 | 标记 advisory 继续 | 暂停等待人工介入
- evidence: <缺失 receipt、review 或 validation artifact>
```

forked skill 不得调用 `AskUserQuestion`；主 Harness 负责向用户展示选项并持久化决定。

## Step 1: verify.collect

```bash
enterprise-harness handoff create <change-id> verify verify.collect execute
# subagent: enterprise-harness:verification-executor
```

▸ **Expect**: `validation.md` 写入，outputRefs 非空。

## Step 2: verification-reviewer

```bash
enterprise-harness handoff create <change-id> verify verify.collect check <executor-runId>
# subagent: enterprise-harness:verification-reviewer
```

▸ **Expect**: verdict=pass。block → blockers 必须非空且含具体返工步骤。

## Step 3: API check（有 API 变化时）

```bash
enterprise-harness handoff create <change-id> verify verify.check-api execute
# subagent: enterprise-harness:verification-executor
enterprise-harness handoff create <change-id> verify verify.check-api check <runId>
# subagent: enterprise-harness:api-consistency-reviewer
```

▸ `unsupported` 不得提升为 pass。

## 完成

```bash
enterprise-harness lifecycle validated <change-id>
enterprise-harness workflow decide <change-id> enter-archive
```

▸ **Verify**: `workflow status <change-id>` 显示 stage=archive，`validation.status=fresh`。
▸ **一票否决**：任何 reviewer block 或 API parser unsupported → 不得进入 archive。
