---
name: harness-design
description: design 阶段：把 confirmed requirements 转成可验证的接口、数据、架构设计，通过独立 reviewer。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness Design

由 `/enterprise-harness:harness` 派发的 forked subagent，无用户对话通道。权威输入只有 change 目录的 durable artifact。

## 按需 reference

- 行为名不确定：读 `../harness/reference/behavior-map.md`
- execute/check 输出：读 `../harness/reference/protocol/executor-result-contract.md` 或 `../harness/reference/protocol/checker-verdict-contract.md`
- API scope 判断与 `design.check-api`：读 `../harness/reference/stage-decisions.md`

## 开始前：发现缺失用户决定

forked skill **不得**调用 `AskUserQuestion`。requirements 中若缺少 API scope、DB/migration scope 或其他用户决策，停止该 run，并向主 Harness 返回：

```text
NEEDS_DECISION
- question: <唯一最关键的问题>
- options: <2-4 个可选项>
- evidence: <requirements 中导致不确定的段落或 artifact>
```

主 Harness 才能向用户提问、持久化选择并创建新的 design handoff。

## Step 1: 探索（如需）

接口、数据或调用方事实不足时：

```bash
enterprise-harness handoff create <change-id> design design.explore-code execute
# subagent: enterprise-harness:code-explore
enterprise-harness handoff create <change-id> design design.explore-code check <runId>
# subagent: enterprise-harness:design-reviewer
```

▸ **Expect**: `evidence/<id>-exploration.md` 写入，verdict=pass。

## Step 2: 产出设计

```bash
enterprise-harness handoff create <change-id> design design.produce execute
# subagent: enterprise-harness:design-executor，消费 harness/templates/design.md
```

设计必须覆盖适用维度（不适用写 `N/A + 原因`）：

| 维度 | 关键产出 |
|------|---------|
| goals / non-goals | 明确边界 |
| component boundaries | 分层依赖方向（domain 不依赖 Spring/DB/HTTP） |
| API request/response/error | path · DTO · HTTP status · 错误码 |
| auth / idempotency | 鉴权方式 · 幂等键 |
| caller compatibility | 不破坏已有合同 |
| schema / migration / rollback | 迁移脚本 · 回滚路径 |
| concurrency / transaction | 隔离级别 · 锁策略 |
| test strategy | 单元 · 集成 · 契约测试点 |

▸ **Expect**: `design.md` 写入，outputRefs 非空。

## Step 3: 独立 review

```bash
enterprise-harness handoff create <change-id> design design.produce check <executor-runId>
# subagent: enterprise-harness:design-reviewer
```

▸ **Expect**: verdict=pass。block → 用**新 run** 修复后重审，不复用旧 runId。

## Step 4: API contract check（API scope=是 时）

```bash
enterprise-harness handoff create <change-id> design design.check-api execute
# subagent: enterprise-harness:design-executor
enterprise-harness handoff create <change-id> design design.check-api check <runId>
# subagent: enterprise-harness:api-consistency-reviewer
```

▸ **Expect**: verdict=pass。`unsupported` 不得提升为 pass。

## 完成

```bash
enterprise-harness workflow decide <change-id> approve
```

▸ **Verify**: `workflow status <change-id>` 显示 stage=plan，`designApproved=true`。
