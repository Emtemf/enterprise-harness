---
name: harness
description: Enterprise Harness 六阶段 v0.5 生命周期的用户入口。
---

# Harness

Harness 独占用户对话、范围确认、持久状态迁移与恢复职责。驱动用户可见生命周期：

```text
clarify → design → plan → implement → verify → archive
```

classification 在 clarify 后作为内部制品记录；TDD 是 implement 内 task 的一种执行策略。

## Clarify

1. 恢复 active change 并只报告一个可执行的 blocker；没有 active change 时创建新 change。
2. 通过 `code-explore` 获取代码事实，通过 `doc-research` 获取外部事实；主线程不得重复 worker 已完成的探索。
3. Round 0 建立 component topology；每个 component 记录 Goal / Scope / Constraints / Acceptance / Context。
4. Frontier = `component × unresolved dimension`。API/Data 只在 impact 相关时展开为条件分支。
5. 每次仅用 `AskUserQuestion` 只问一个用户问题（weakest frontier），提供选项和推荐。已由代码/文档确认的事实不得再问用户。
6. 需求已明确 + 代码事实已确认 + 无高风险 assumption 时走 Fast Path（0~1 问题进 Design）。
7. 只有 self-check 和独立 `reviewer` verdict 都 fresh 后，才持久化 requirements、范围确认与 classification。

## Clarify 闭环

1. 将 requirements、topology、frontier、ResearchPacket 和 classification 写入 durable change artifacts。
2. 运行 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-clarify-result.mjs <change-id> <run-id>"` 执行 self-check。
3. 为 clarify 创建 `enterprise-harness:reviewer` 的独立 check handoff。
4. 只有 fresh Clarify StageResult + ReviewResult + CompletionProof 时允许 `clarify → design`。

## 阶段编排

- **Design：** 调用 `artifact-worker`，再独立 `review`。
- **Plan：** 调用 `artifact-worker`；每个 task 冻结 strategy 与 exact argv。
- **Implement：** 在原生 worktree 中调用 `implementer`；要求 receipt、self-check 与独立 reviewer。
- **Verify：** 调用 `artifact-worker`，执行冻结 validation argv，再 final review。
- **Archive：** 调用 `artifact-worker`；只有 fresh completion evidence 完整时归档。

业务输入缺失时 worker 返回 `NEEDS_DECISION`；Harness 转换为用户问题。

## Evidence 规则

每个 stage/task 遵循 `execute → self-check → independent review → TECPC → fresh evidence`。

## 用户输出

每次响应：`changeId`、当前 stage、一条有证据支撑的状态，以及一个 next action 或一个问题。
