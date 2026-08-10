---
name: harness-clarify
description: Enterprise Harness 的 clarify 阶段。用于先探索事实、执行七维歧义评分、逐个澄清问题并确认 scope。route 由独立的 harness-route 承担。
user-invocable: false
---

# Harness Clarify

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

本 skill 只负责 clarify。tier、归属与影响面属于 route，见 `harness-route`。

## 为什么不 fork

clarify 的核心行为是一问一答。forked subagent 没有用户对话通道，所以本 skill 在主对话中
inline 运行。但探索和整理**必须**委托隔离 subagent——保护主上下文预算、满足 pre-explore gate。

## 核心机制：设计树 + frontier

把需求看作一棵**设计树**：每个维度/决策下面挂着依赖它的子问题。
**frontier** = 当前可以问的维度——前提条件已满足、不依赖其他未解决维度。

每一轮：
1. 并行启动所有必要探索（代码 + 文档），不等探索完成就先问 frontier 里**不依赖代码事实**的维度。
2. 探索结果回来后，frontier 向外扩展，问下一批因此解锁的维度。
3. 每轮只问 frontier 中**最薄弱的一个维度**，并附上推荐答案。

原则：**探索是你的职责，不是用户的。** 能用 subagent 查到的，不问用户。

## 探索顺序约束

**在至少一个 exploration brief 的 checker 返回 pass/advisory 之前，不得问代码相关维度。**
Target/Scope/Constraint 维度不依赖代码事实，可以先问；Data/Interface/Acceptance 通常要等探索结论。

## clarify 执行流

### 第 0 步：评估 frontier

分析七维，把维度分成两类：
- **无需代码事实**：T 目标、Scope、Constraint/risk → 可立即进入 frontier
- **依赖代码事实**：Data/SQL、Interface/API、Acceptance criteria → 等探索

### 第 1 步：并行启动探索（不阻塞提问）

对每个代码/文档事实缺口：
- 创建 exploration brief
- 创建 `clarify.explore-code` execute handoff → 派 `enterprise-harness:code-explore`
- 创建 `clarify.research-docs` execute handoff → 派 `enterprise-harness:doc-research`
- 探索运行期间，同步推进不依赖它的 frontier

### 第 2 步：问 frontier 里最薄弱的维度

每次只问一个问题，格式：

```
❓ **<维度名>**：<问题正文，可含选项 A/B/C>

➡️ 推荐：<你的推荐答案及理由>
```

只问用户**真正需要决策**的事项。探索可以自行查到的不问。

### 第 3 步：探索结果回来后扩展 frontier

checker pass → 依赖该事实的维度进入 frontier → 下一轮提问或合成。

### 第 4 步：综合与评分

每轮用户回答后，对 `clarify.synthesize` 创建 execute handoff，派 `clarify-synthesizer`
更新 requirements 和七维评分；等 result.json 后创建 check handoff，派 `clarify-reviewer`
独立检查。

展示评分格式：

```
📊 歧义评分（第 N 轮）

| 维度            | 上轮 | 本轮 | 依据 |
|-----------------|------|------|------|
| T 目标 clarity  |      |    5 | 用户确认了… |
| Scope clarity   |      |    4 | codegraph 发现了… |
| …               |      |      |      |

Overall: X.X → Y.Y
Weakest: <维度名> (<分数>)
→ 下一个问题指向该维度（因为前提已满足）
```

### 第 5 步：达标与确认

全部维度 >= 4 且无高风险歧义后：
- 展示完整评分 + 依据
- 请用户确认 scope（`confirm-scope` 与 `confirm-clarity` 是两个独立动作）

## 七维

| 维度 | 描述 | 通常是否依赖代码探索 |
|------|------|---------------------|
| T 目标 clarity | 目标、成功方向 | 否 |
| Scope clarity | 影响范围、edge case | 是（codegraph） |
| User/actor clarity | 角色、场景、异常路径 | 否 |
| Data/SQL clarity | 数据结构、迁移、约束 | 是 |
| Interface/API clarity | 接口签名、error contract | 是 |
| Acceptance criteria clarity | 可执行验收断言 | 是 |
| Constraint/risk clarity | 约束、风险、缓解方案 | 否 |

所有维度 >= 4、没有 unresolved high-risk ambiguity、用户明确确认 scope 后，clarify 才 pass。

## 必须产出

- `requirements.md`（七维评分 + 依据 + overall + weakest + 用户 scope 确认）
- exploration briefs
- executor result + checker verdict（synthesize + review）

## 阻断

- 主 orchestrator 直接探索代码（违反 pre-explore gate）
- 先问用户，后探索（frontier 顺序违反）
- 只给 overall 不给维度依据
- 一次问多个问题
- 用户未确认 scope
- reviewer block

## 下一阶段

进入 `harness-route`。长期评分合同见 `harness/specs/ambiguity-scoring.md`。
