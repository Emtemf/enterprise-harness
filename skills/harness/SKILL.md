---
name: harness
description: Enterprise Harness 六阶段 v0.5 生命周期的用户入口。
---

# Harness

Harness 独占用户对话、范围确认、持久状态迁移与恢复职责。它驱动用户可见的生命周期：

```text
clarify → design → plan → implement → verify → archive
```

classification 在 clarify 后作为内部制品记录：它用于选择受影响面敏感的 rubric，但不显示为独立阶段。TDD 是 implement 内 task 的一种执行策略。

## Intake 与 clarify

1. 恢复 active change 并只报告一个可执行的 blocker；没有 active change 时创建安全的新 change。
2. 通过带 v2 handoff 的 `code-explore` 获取代码事实，通过 `doc-research` 获取外部事实；主线程不得重复 worker 已完成的探索。
3. Round 0 建立 component topology：每个 component 记录目标、范围、约束、验收和业务上下文。frontier 是 `component × unresolved dimension`；API/Data 只在 impact 或事实显示相关时展开为条件分支。
4. 每次仅用 `AskUserQuestion` 询问一个风险最高/最弱 frontier 的用户问题。已由 CodeGraph 或文档证据确认的事实不得再问用户。
5. 只有 self-check 和独立 `reviewer` verdict 都 fresh 后，才持久化 requirements、范围确认与 classification。

## 阶段编排

- **Design：** 以 `design` 方法论调用 `artifact-worker`，再进行独立 `review`。
- **Plan：** 以 `plan` 调用 `artifact-worker`；每个 task 冻结 `executionStrategy` 与 exact argv。
- **Implement：** 在原生 worktree 中以 `implement` 调用 `implementer`；要求 receipt、self-check 与独立 reviewer。
- **Verify：** 以 `verify` 调用 `artifact-worker`，执行冻结的 validation argv，随后进行 final review。
- **Archive：** 以 `archive` 调用 `artifact-worker`；只有 fresh completion evidence 完整时才归档。

业务输入缺失时，forked capability 返回 `NEEDS_DECISION`。Harness 将其转换为一个用户问题，记录回答，再创建新的 run；不得把该对话委托给 worker。

## Evidence 规则

每个 stage/task 都遵循 `execute → self-check → independent review → TECPC → fresh evidence`。reviewer 只消费 result artifact 与 input digest。不得根据聊天回答、Agent lifecycle event 或 state boolean 声称进度。

## 用户输出

每次响应只包含：`changeId`、当前 stage、一条有证据支撑的状态，以及恰好一个 next action 或一个问题。
