---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - harness/upstream/registry.json
testRefs:
  - runtime/test/offline-diagnostics-smoke.mjs
---

# Upstream Mapping

## 目标

明确 Enterprise Harness 当前设计借鉴了哪些上游、各自学什么、不学什么，以及这些来源如何映射到当前仓库。

## 摘要

- **Superpowers**：学习 staged UX、double-check、subagent 分工、TDD worktree/subagent 风格
- **OpenSpec**：学习 change / spec / archive 的资产模型
- **deep-interview（来自 oh-my-claudecode）**：学习 clarify 阶段的苏格拉底式提问方法
- **gump-agent-workspace**：学习 durable state 与可恢复工作空间理念
- **role-workbench**：学习阶段角色视角，但当前只作为 draft 参考
- **Claude Code 官方建议**：学习 command / skill / agent / hook 的职责边界

## 1. Superpowers

来源：`https://github.com/obra/superpowers`

### 学什么
- 分阶段工作流骨架
- staged UX
- 高噪声任务下沉给 subagent
- 关键节点 double-check
- TDD 使用 worktree / subagent 的实践风格

### 不学什么
- 不把其运行时行为直接原样移植
- 不自动同步其插件实现
- 不把其命令面直接照搬到本仓库

### 当前映射
- `/harness` staged workflow 前门
- `clarify → route → design → plan → tdd → verify → archive`
- `code-explore` / reviewer 型 agent 分工
- TDD contract 中的 subagent + worktree + 真实构建命令要求

## 2. OpenSpec

来源：`https://github.com/Fission-AI/OpenSpec`

### 学什么
- change / spec / archive 资产模型
- durable artifact 思路
- 归档作为工作流一等对象

### 不学什么
- 不把 OpenSpec 的命令面直接搬进来
- 不让 OpenSpec 风格反过来主导 Claude Code 交互前门

### 当前映射
- `harness/changes/`
- `harness/specs/`
- `harness/archive/`
- `design.md` / `tasks.md` / `validation.md` / reviews / evidence 等资产观念

## 3. deep-interview（oh-my-claudecode）

来源：`https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/skills/deep-interview/SKILL.md`

### 学什么
- 苏格拉底式澄清
- 先问关键问题，而不是直接进入实现
- 弱假设驱动的澄清推进方式

### 不学什么
- 不逐字复制 skill
- 不照搬原仓库全部上下文设定

### 当前映射
- `harness-intake` 中的 clarify 策略
- `ambiguity-scoring.md`
- weakest dimension targeting
- 一次一问、用户修正评分

## 4. gump-agent-workspace

来源：博客文章

### 学什么
- durable workspace
- 中断后恢复
- state 驱动，而不是只靠对话记忆

### 当前映射
- `state.json`
- `workflow.stage`
- `ACTIVE_CHANGE`
- status / stop / session-start 的恢复提示

## 5. role-workbench

来源：`https://github.com/Emtemf/role-workbench/tree/master/.claude/skills`

### 学什么
- 用角色视角提高阶段质量
- 在 design / review 场景中强化 perspective

### 当前状态
- 只作为草案参考
- 尚未接入 runtime 主流程

## 6. Claude Code 官方建议

### 学什么
- slash/command 适合作为显式前门
- skill 适合作为可复用方法论包
- agent 适合作为专职执行角色
- hook 适合作为生命周期机械门禁

### 当前映射建议
- `/harness`：唯一用户前门
- 阶段 skill：方法论与用户引导
- agent：explore / reviewer / executor
- hook adapter / primitives：durable state + hard gate + deterministic backend action
- `harness/`：repo truth / specs / templates / changes / archive

### CodeGraph / Context7 的位置
- **CodeGraph** 不是普通工具，而是 `code-explore` lane 的能力核心
- **Context7** 不是普通工具，而是 `doc-research` lane 的能力核心
- phase 1 的 clarify / route / design / verify 都依赖这两条探索通道来补事实，而不是只靠模型记忆

## 总体设计结论

Enterprise Harness 当前更合理的形态不是“skill-only”，而是：

- **Superpowers 风格的 staged UX** 作为交互编排骨架
- **OpenSpec 风格的资产模型** 作为 durable truth
- **deep-interview 风格的 clarify 技术** 作为 intake 方法
- **Claude Code 官方职责边界** 作为实现层分工约束

这意味着：
- phase 1 先做 Claude Code-only
- 用户体验尽量收口到 `/harness` + 阶段 skill
- 专职复杂执行下沉到 agent
- 真正不可绕过的正确性继续保留在 runtime/hook
