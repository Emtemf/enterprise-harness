---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-21
implementationRefs:
  - harness/upstream/registry.json
  - skills/harness/SKILL.md
testRefs:
  - runtime/test/harness-standard-skill-smoke.mjs
  - test/skill-evals/harness/evals.json
  - runtime/test/offline-diagnostics-smoke.mjs
---

# Upstream Mapping

## 目标

记录 Enterprise Harness 从各上游吸收的边界、主动舍弃的行为和当前仓库映射。上游只提供方法或
资产模型；`harness/specs/` 与 runtime 才是本项目合同。审阅 commit 固定在
`harness/upstream/registry.json`，不得把浮动 `main` 当成可复现证据。

本文件是开发 provenance，不是生产 Skill 的 supporting reference。`skills/harness/SKILL.md` 只保留
可执行流程，不加载本文件、不复述上游名称，也不让上游叙述占用运行上下文。

## 当前组合

```text
Clarify = Grill Me tree/frontier
        + Deep Interview topology/scoring
        + Superpowers approval discipline

Lifecycle = clarify → design → plan → implement → verify → archive
```

### Grill Me / Grilling

来源：`mattpocock/skills` 的 `grill-me` 与 `grilling`。

吸收：

- design tree / decision tree；
- frontier 随用户回答重建，而不是预制静态问卷；
- Facts 由 agent 查找，Decisions 由用户决定。

主动舍弃：上游 `grilling` 一轮询问整个 frontier。Harness 使用 Claude Code 原生
`AskUserQuestion`，每轮只问一个 weakest / highest-risk decision，再重新计算 frontier。

当前映射：`skills/harness/SKILL.md` 的 Phase 2/3，以及 requirements 模板的 frontier 与 round ledger。

### Deep Interview

来源：`Yeachan-Heo/oh-my-claudecode` 的 `deep-interview`。

吸收：

- Round 0 先枚举并确认 component topology；
- component-level clarity，避免一个清晰组件掩盖未澄清 sibling；
- weakest component × dimension targeting；
- brownfield fact-first、逐轮评分与回答后重评分；
- Fast Path 只减少问题数量，不降低 readiness gate。

主动舍弃：OMC state、pipeline、threshold settings、challenge agent 和其专属命令面。Harness 使用
自己的 Handoff v2、0–5 component × dimension 合同与 durable change artifacts。

当前映射：`harness/specs/ambiguity-scoring.md`、Harness Skill、requirements 模板和 Clarify finalizer。

### Superpowers

来源：`obra/superpowers`，重点为 `brainstorming`、`writing-plans`、
`test-driven-development`、`subagent-driven-development` 与 `verification-before-completion`。

吸收：

- 先理解和确认，再设计与实施；
- 一次一个澄清问题，给出推荐与取舍；
- bounded 任务可缩短过程，但 approval gate 不消失；
- plan、执行、独立检查和 fresh verification 的 staged discipline。

主动舍弃：不复制其技能调度器、命令面或运行时实现；不让 Superpowers 的阶段名称替换 Harness
的六阶段 lifecycle。

当前映射：`/enterprise-harness:harness` 用户前门、stage skills、独立 capability agents 和
`execute → self-check → independent review → TECPC → fresh evidence`。

### OpenSpec

来源：`Fission-AI/OpenSpec`。

只吸收 change / spec / archive 的 durable artifact 模型；不复制 OPSX 命令面。当前映射为
`harness/changes/`、`harness/specs/`、`harness/archive/` 及 digest freshness。

### Claude Code 官方职责边界

依据 Claude Code Skills、subagents、hooks 与 plugin 官方文档：

- `/enterprise-harness:harness`：plugin namespaced Skill 和唯一用户前门；
- `skills/`：按需加载的可复用流程与 supporting resources；
- `agents/`：事实探索、artifact 执行、实现与独立 review 的隔离 capability；
- `hooks/`：宿主生命周期的机械 gate、ledger 与恢复提示；
- `runtime/`：确定性状态迁移、schema、digest 与 receipt 验证。

Harness 不使用 `context: fork`，因为 Clarify 需要持续用户对话。stage worker skills 使用 forked
context；hooks 不承担需求分析或第二套 workflow engine。

## Runtime 上游

- **CodeGraph：** code fact lane。用于符号、调用链和影响面；fallback 必须记录 degraded 原因。
- **Context7：** documentation fact lane。用于外部库、框架、SDK 和版本行为；不可用时只回退到官方文档。

两者提供 evidence，不替用户作业务决定，也不直接改变 lifecycle state。

## Anti-regrowth

不得重新引入：

- `route` 或 `tdd` lifecycle stage；
- 固定全局七维问卷；
- 一轮批量询问整个 frontier；
- 可由代码或官方文档回答的用户问题；
- 用 agent 自报或聊天文字替代 independent review / fresh evidence；
- 让 hook 或 upstream plugin 成为第二权威 workflow。
