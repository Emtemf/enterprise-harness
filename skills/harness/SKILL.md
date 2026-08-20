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

## 方法论来源

Enterprise Harness 的 clarify 方法论融合自三个参考项目：

- **grill-me**（mattpocock/skills）：design tree / decision tree / frontier / 逐步消除不确定性。核心影响：Frontier 维护和优先级排序。
- **deep-interview**（Yeachan-Heo/oh-my-claudecode）：Socratic questioning / ambiguity gate / Round 0 topology / weakest uncertainty first。核心影响：component topology 拆解和每轮 weakest-first 策略。
- **superpowers brainstorming**（obra/superpowers）：先理解 → 再设计 → 用户确认关键决策 → 才实施。核心影响：clarify 必须在 design 之前完成理解阶段。

设计阶段参考 superpowers 的 writing-plans（executable task contract）和 verification-before-completion（evidence before claims）。

---

## Intake 与 Clarify

### 核心原则

> **Facts → Agent 找；Decisions → 用户决定。**

能够通过 CodeGraph、Context7、当前代码或官方文档得到的信息，不应问用户。真正问用户的是：业务意图、兼容性取舍、Scope、风险接受。

### Round 0：Topology

通过以下来源建立 component topology：

1. 用户原始请求
2. CodeGraph 代码事实（通过 `code-explore` agent）
3. Context7 文档事实（通过 `doc-research` agent）
4. 已有 decisions

将用户请求拆分为 component tree：

```text
Feature
├── Component A（状态机）
├── Component B（退款）
├── Component C（通知）
└── Component D（审计）
```

### 维度评估

每个 component 只评估五个核心维度：**Goal / Scope / Constraints / Acceptance / Context**。

API 和 Data/SQL 不是固定维度，只在 impact 或事实显示相关时展开为条件分支。

### Frontier 分析

Frontier = `component × unresolved dimension`。

每轮策略：

1. **广度优先**：先覆盖所有主要 architecture surface
2. **有限深入**：对重要且高耦合的主题，连续追问 2-4 个问题
3. **切换**：同一主题追问 2-4 个关键问题后，切换到其他架构面
4. **回补**：主要架构面覆盖完成后，回到尚未解决的关键分歧
5. **每次只问一个问题**，提供明确选项及推荐

### Fast Path

当以下条件**同时**满足时，可跳过深度 Interview：

- 用户请求中已包含明确的 Scope、Acceptance、至少一个 Constraint
- CodeGraph 确认了受影响的代码路径
- 没有标记为 high-risk 的 assumption

此时 0~1 个问题即可进入 Design。

### Ambiguity Scoring

每轮 clarify 必须：

1. 展示当前 component × dimension 评分表 + overall + weakest frontier
2. 解释每个分数的依据（CodeGraph 发现 / Context7 文档 / 用户回答）
3. 让用户确认/修正
4. 找出 weakest frontier
5. 只问一个针对 weakest 的问题（选项式 + 推荐）
6. 用户回答后重新评分

评分标准详见 `harness/specs/ambiguity-scoring.md`。

### 用户确认模式

- 使用 `AskUserQuestion`，每次只问一个问题
- 提供 2-4 个明确选项
- 标注推荐选项
- 选项式 A/B/C + "其他" 兜底
- 确认后记录回答，不重复提问

### 事实与决策分离

| Agent 自己找 | 才问用户 |
|---|---|
| 代码结构、Symbol、调用链 | 业务意图 |
| 第三方库 API 行为 | 兼容性取舍 |
| 现有测试覆盖 | Scope 边界 |
| 数据模型、表结构 | 风险接受 |

### Clarify 闭环

确认 scope 后，Main 必须：

1. 将 requirements、topology、frontier、ResearchPacket 引用和 classification 写入 durable change artifacts。
2. 运行 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-clarify-result.mjs <change-id> <run-id>"` 执行确定性 self-check。
3. 为 clarify 创建 `enterprise-harness:reviewer` 的独立 check handoff。
4. 只有 fresh Clarify StageResult、ReviewResult 和 CompletionProof 存在时，才允许 `clarify → design`。

`finalize-clarify-result.mjs` 是 Main-owned artifact finalizer，不是新的 Agent 或 lifecycle stage。

---

## 阶段编排

### Design

以 `design` 方法论调用 `artifact-worker`。design 方法融合 superpowers brainstorming：

- 先理解（clarify 已完成）
- 再设计（component boundaries、interfaces、error model）
- 关键决策由用户确认
- 才进入 plan

以 [design 方法](skills/design/references/method.md) 约束设计过程。每个 requirement 必须映射到设计决策、边界、验证和回滚。

再进行独立 `review`；design 必须 Self-check PASS + Independent Review PASS 才可进入 plan。

### Plan

以 `plan` 调用 `artifact-worker`；每个 task 冻结 `executionStrategy` 与 exact argv。plan 的 contract 来自 superpowers writing-plans：每个 task 必须 small / independent / testable / reviewable / recoverable。

### Implement

在原生 worktree 中以 `implement` 调用 `implementer`；要求 receipt、self-check 与独立 reviewer。每个 task 逐个执行，不是一次性完成整个 feature。

### Verify

以 `verify` 调用 `artifact-worker`，执行冻结的 validation argv，随后进行 final review。verify 不是又一次实现；它从整个 Change 层面证明最终结果成立。

### Archive

以 `archive` 调用 `artifact-worker`；只有 fresh completion evidence 完整时才归档。

---

## 质量闭环

每个 stage/task 都遵循：

```text
Execute → Self-check → Independent Review → TECPC → Evidence Fresh → NEXT
```

- **Self-check**：作者自己检查工作是否满足当前 stage 的显式合同（不是"感觉不错"）
- **Independent Review**：另一个独立 context 从外部寻找遗漏、矛盾、风险
- **TECPC**：Target / Evidence / Context / Path / Correction 统一完成证据
- **Evidence Fresh**：所有结论绑定到 input digest；artifact 一变，旧结论自然 stale

## 用户输出

每次响应只包含：`changeId`、当前 stage、一条有证据支撑的状态，以及恰好一个 next action 或一个问题。
