---
name: harness-clarify
description: Enterprise Harness 的 clarify 阶段。用于先探索事实、执行七维歧义评分、逐个澄清问题并确认 scope。route 由独立的 harness-route 承担。
user-invocable: false
---

# Harness Clarify

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

本 skill 只负责 clarify。tier、归属与影响面属于 route，见 `/harness-route`。

## 为什么不 fork

clarify 的核心行为是一次只问用户一个问题。forked subagent 没有用户对话通道，所以本 skill 与入口 `harness` 一样在主对话中运行；探索与整理仍然委托隔离 subagent。

## 输入

- active change
- 用户原始需求
- 目标项目合同
- 已有 requirements 和 exploration briefs

## clarify

1. 判断事实缺口。
2. 代码事实：创建 exploration brief，派 `enterprise-harness:code-explore`，要求 CodeGraph-first。
3. 外部事实：创建 exploration brief，派 `enterprise-harness:doc-research`，要求 Context7-first。
4. 主 orchestrator 消费压缩结论，不重复探索。
5. 派 `clarify-synthesizer` 更新 requirements 和评分。
6. 派 `clarify-reviewer` 独立检查澄清质量。
7. 展示七维评分、依据、overall 和 weakest dimension。
8. 一次只问用户一个针对 weakest dimension 的问题。

七维：

- Target
- Scope
- User/actor
- Data/SQL
- Interface/API
- Acceptance criteria
- Constraint/risk

所有关键维度均不低于 4、没有高风险歧义且用户明确确认 scope 后，clarify 才 pass。

## route

route 不在本 skill 内执行。clarify pass 后进入 `/harness-route`，由 `route-decider` 产出分流决策、`requirement-reviewer` 独立复核。

## 必须产出

- `requirements.md`
- 七维评分和证据依据
- 用户 scope confirmation
- executor result 和 checker verdict

## 阻断

- 主 orchestrator 直接探索代码
- 只给 overall 不给维度依据
- 一次问多个问题
- 用户未确认 scope
- reviewer block

## 下一阶段

进入 `/harness-route` 确定 tier 与影响面。长期评分合同见 `harness/specs/ambiguity-scoring.md`。
