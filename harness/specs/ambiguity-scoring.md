---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-21
implementationRefs:
  - skills/harness/SKILL.md
  - skills/harness/assets/requirements.md.tmpl
  - skills/harness/scripts/finalize-clarify-result.mjs
testRefs:
  - runtime/test/clarify-stage-contract-smoke.mjs
  - runtime/test/clarify-topology-template-smoke.mjs
  - runtime/test/harness-standard-skill-smoke.mjs
---

# Ambiguity Scoring Contract

## 目标

把"需求不清晰"从主观感觉变成 staged workflow 可消费的显式 gate。

Clarify 的核心方法论融合自三个来源：

- **grill-me**（mattpocock/skills）：design tree / decision tree / frontier / 逐步消除不确定性
- **deep-interview**（Yeachan-Heo/oh-my-claudecode）：Socratic questioning / ambiguity gate / Round 0 topology / weakest uncertainty first
- **superpowers brainstorming**（obra/superpowers）：先理解 → 再设计 → 用户确认关键决策 → 才实施

> **核心原则：Facts → Agent 找；Decisions → 用户决定。**

能够通过 CodeGraph、Context7、当前代码或官方文档得到的信息，不应问用户。真正问用户的是：业务意图、兼容性取舍、Scope、风险接受。

## 维度模型

采用 **Component × 5 核心维度**，不是固定的全局维度列表。

### 组件拓扑

Clarify 的 Round 0 首先建立 component topology：

```text
Feature
├── Component A
├── Component B
└── Component C
```

通过以下来源确定组件：

- 用户原始请求
- CodeGraph 代码事实
- Context7 文档事实
- 已有 decisions

### 五核心维度

每个 component 只评估五个核心维度：

| 维度 | 含义 |
|------|------|
| **Goal** | 这个 component 要做什么？ |
| **Scope** | 影响边界在哪？哪些文件/模块/API/数据会变？ |
| **Constraints** | 技术约束、兼容性要求、风险 |
| **Acceptance** | 如何判断这个 component 做完了？ |
| **Context** | 业务/领域上下文，为什么需要这个 |

### 条件分支

**API 和 Data/SQL 不是固定维度。** 只有当 impact 或代码事实表明相关时，才展开为条件分支：

```text
impact.api = yes
→ 展开 Interface/API dimension

impact.data = yes
→ 展开 Data/SQL dimension
```

不适用的维度记录 `N/A` 与理由。

## 分值含义

每个 component × dimension 组合采用 0-5 分：

### 0
完全未知或自相矛盾，无法安全推进。

### 1
只有方向性意图，没有可执行边界。

### 2
已知部分目标，但关键范围/约束/验收缺失。

### 3
中等清晰度，已足够讨论，但不适合进入 design。

### 4
足以进入 design；剩余不确定项已显式记录且风险可控。

### 5
需求边界、约束与验收标准都已足够明确。

## Frontier

Frontier = `component × unresolved dimension`。

每轮选择策略：

1. 先覆盖所有主要 architecture surface（广度优先）
2. 对当前重要且高耦合的主题，可连续追问最多 2 个 Decision 问题（有限深入）
3. 仍有 sibling component < 4 时，第三问必须切换；只有 sibling 明确依赖当前 decision 才可例外，并记录 dependency evidence
4. 主要架构面覆盖完成后，回到尚未解决的关键分歧或薄弱环节
5. 每次只问一个问题，提供几个明确选项及推荐
6. 只询问真正影响架构、产品行为或实现可行性的问题
7. 细枝末节和可合理推断的内容自行决定

## 达标条件

clarify-ready 的最低条件：

- 所有已识别 component 的关键维度 >= 4
- 没有 unresolved high-risk ambiguity
- 用户已显式确认执行范围
- 每个维度的评分必须有事实依据（CodeGraph / Context7 / 用户回答）

## Fast Path

必须支持：

```text
需求本身已经明确
+
代码事实明确（codegraph 确认了相关模块和路径）
+
没有高风险 assumption
```

那么：

```text
0~1 个问题
→ Design
```

不能因为有 Harness 就强制用户接受一场长 Interview。

Fast Path 判定条件（同时满足时触发）：

1. 用户请求中已包含明确的 Scope、Acceptance、至少一个 Constraint
2. CodeGraph 确认了受影响的代码路径
3. 没有标记为 high-risk 的 assumption
4. 所有 active component 的关键维度都已 >= 4

Fast Path 只减少问答次数，不降低 clarify-ready、用户确认或 evidence freshness 门槛。它仍需
持久化 topology、评分依据和 scope confirmation；不得用 overall 平均值掩盖任何低分 component。
Fast Path 先形成 provisional topology、评分和 requirements 摘要，再由原始明确授权作为确认来源，
或用一次 `AskUserQuestion` 联合确认 topology、requirements 与 scope；不得确认一个尚未形成的 artifact。

## 每轮操作规则

每轮 clarify 必须：

1. **展示当前评分表**：component × dimension 评分 + coverage summary + weakest frontier
2. **解释评分依据**：每个分数引用具体探索发现或用户回答，不得凭空打分
3. **让用户确认/修正**：用户有权质疑任何评分
4. **找出 weakest frontier**
5. **只问一个针对 weakest frontier 的问题**（选项式 + 推荐）
6. **用户回答后重新评分**，说明为什么分数变化

### 隔离接力

- Main Harness 保留一问一答（唯一用户交互入口）
- `artifact-worker` 在新上下文中更新 requirements 和评分
- `reviewer` 在独立上下文中检查评分依据、weakest、风险与用户确认
- Runtime 机械检查维度是否齐全、分数是否 0-5、是否达阈值

### 用户确认模式

使用 `AskUserQuestion` 时：

- 每次只问一个问题
- 提供 2-4 个明确选项
- 标注推荐选项
- 选项式 A/B/C + "其他" 兜底
- 确认后记录回答，不重复提问

## 交互格式示例

```
📊 歧义评分（第 2 轮）

| Component | Dimension | 上轮 | 本轮 | 依据 |
|-----------|-----------|------|------|------|
| OrderCancel | Goal | 2 | 4 | 用户确认了取消范围 |
| OrderCancel | Scope | 1 | 3 | codegraph 发现 5 张关联表 |
| Refund | Goal | 3 | 3 | 仍不确定退款策略 |
| ... | | | | |

Overall: 2.4 → 2.7
Weakest: Refund × Goal (3)
→ 下一个问题：退款是原路返回还是转为余额？

请确认评分是否准确。
```

## Requirements Artifact

`requirements.md` 必须记录：

- 每个 component 的维度分数
- 当前 weakest frontier
- 仍待澄清的问题
- 用户确认状态
- topology 图（component 依赖关系）
- 每轮 question/answer、评分变化与 evidence source

## 禁止事项

- 不得在 ambiguity 未达标时直接进入 design
- 不得一次批量抛给用户多个问题
- 不得只给 overall score 而不指出 weakest frontier
- 不得跳过用户确认直接视为可执行范围
- 不得把可由 CodeGraph / Context7 获取的事实问给用户
- 不得在覆盖主要架构面前无限向下穿透细节
