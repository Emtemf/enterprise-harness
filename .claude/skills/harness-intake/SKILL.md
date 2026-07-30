---
name: harness-intake
description: Enterprise Harness 的 clarify/route 阶段。用于先探索事实、执行七维歧义评分、逐个澄清问题、确认 scope，并确定 tier 和影响面。
---

# Harness Intake

由 plugin 入口 `/enterprise-harness:harness`（standalone 为 `/harness`）按当前 stage 加载。

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
6. 派 `requirement-reviewer` 独立检查。
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

确认：

- tier：L0/L1/L2/L3
- API、data、architecture、rule 影响
- non-goals
- 必需 reviewer
- 下一阶段

route 事实不足时返回 clarify，不用推测补齐。

## 必须产出

- `requirements.md`
- 七维评分和证据依据
- 用户 scope confirmation
- route/tier/impact projection
- executor result 和 checker verdict

## 阻断

- 主 orchestrator 直接探索代码
- 只给 overall 不给维度依据
- 一次问多个问题
- 用户未确认 scope
- reviewer block

## 下一阶段

L0 可进入 verify；L1+ 进入 design。长期评分合同见 `harness/specs/ambiguity-scoring.md`。
