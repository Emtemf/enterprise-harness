# Ambiguity Scoring Contract

## 目标

把“需求不清晰”从主观感觉变成 staged workflow 可消费的显式 gate。

clarify 阶段必须：
- 一次只问一个问题
- 每轮更新 ambiguity scoring
- 显式针对 weakest dimension 发问
- 在 score 达标且用户确认前，不进入 `route`

## 评分维度

第一版采用 0-5 维度分：

1. Goal clarity
2. Scope clarity
3. User / actor clarity
4. Data / SQL clarity
5. Interface / API clarity
6. Acceptance criteria clarity
7. Constraint / risk clarity

## 分值含义

### 0
完全未知或自相矛盾，无法安全推进。

### 1
只有方向性意图，没有可执行边界。

### 2
已知部分目标，但关键范围/约束/验收标准缺失。

### 3
中等清晰度，已足够形成讨论，但仍不适合进入 design/plan。

### 4
足以进入 design；剩余不确定项已显式记录且风险可控。

### 5
需求边界、约束与验收标准都已足够明确，可安全进入后续执行阶段。

## 达标条件

clarify-ready 的最低条件：

- 所有关键维度 >= 4
- 没有 unresolved high-risk ambiguity
- 用户已显式确认执行范围

## 每轮操作规则

每轮 clarify 必须：

1. 记录当前维度分值
2. 找出 weakest dimension
3. 只问一个针对 weakest dimension 的问题
4. 默认优先使用选项式问题（A/B/C + 其他），降低自由输入负担
5. 在用户回答后重新评分
6. 若已有足够 repo/documentation facts，可先更新事实，再问用户

## 显示规则

对用户至少应透明展示：

- 当前 weakest dimension
- 当前 weakest score
- 为什么下一个问题指向该维度

可选展示：
- 全维度评分表
- overall score

## Requirements Artifact 最低落点

`requirements.md` 至少应记录：

- 每个维度当前分数
- 当前 weakest dimension
- 仍待澄清的问题
- 用户确认状态

## 与 Exploration 的关系

ambiguity scoring 不是只靠用户回答提升。

以下行为都可帮助提升分数：
- 代码探索
- 文档调研
- brownfield 事实确认
- 明确已有 API / SQL / module 约束

因此 clarify 的正确形态是：
- 先探索，再问用户
- 探索与提问交替推进

## 退出条件

仅在以下条件同时满足时，clarify 才可结束：

- ambiguity 达标
- 关键假设已记录
- 用户确认执行范围
- `requirements.md` 已可供 `route` / `design` 消费

## 禁止事项

- 不得在 ambiguity 未达标时直接进入 design
- 不得一次批量抛给用户多个问题
- 不得只给 overall score 而不指出 weakest dimension
- 不得跳过用户确认直接把 clarify 结果视为可执行范围
