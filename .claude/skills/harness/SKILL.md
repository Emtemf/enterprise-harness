---
name: harness
description: >
  Enterprise Harness 的统一流程入口与阶段编排器。用于接住新需求、继续当前 change、识别 clarify / route / design / plan / tdd / verify / archive 所处阶段，并给出下一步 stage skill 或 backend command。适用于“我应该从哪开始”“帮我按 staged workflow 推进”“继续当前 change”“需要一个确定性的后台建档命令”等场景。
---

# Harness Entry

## 目标

给当前仓库提供一个**显式的前门**，而不是只依赖自动加载规则和 hooks。

本入口的职责不是替代 hooks，也不是替代 runtime command，而是把三层模型讲清楚并真正用起来：

1. **Skill**：负责流程编排
2. **Command**：负责本机/runtime/仓库确定性动作
3. **Hooks**：负责自动提醒、阻断、校验

## 入口模型

### 1. 在 Claude Code 会话中
优先使用：

- `/harness`

它是 clarify-first staged workflow 的统一工作流入口，用于：

- 接住新需求
- 继续当前 change
- 判断当前处于 `clarify / route / design / plan / tdd / verify / archive` 的哪一阶段
- 在 gate 满足时把用户导向下一阶段 skill 或 backend command
- 在用户打断后给出恢复入口

### 2. 在本机/runtime 动作中
优先使用：

- `node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]`
- `node harness/plugin/runtime/cli.mjs bootstrap`
- `node harness/plugin/runtime/cli.mjs doctor`
- `node harness/plugin/runtime/cli.mjs sync`
- `node harness/plugin/runtime/cli.mjs verify`

### 3. 自动发生的事情
无需显式调用，但会自动生效：

- `CLAUDE.md`
- `.claude/rules/`
- `.claude/settings.json` hooks

这些负责：

- 默认流程约束
- 写前/写后 gate
- stop validation 检查

## 你被调用后应该怎么做

### 模式 A：用户带来一个新需求 / 修改需求
按 clarify-first staged workflow 推进：

1. 先进入 `clarify`
2. 先做 minimum discovery（codegraph-first / Context7-first）
3. 一次只问一个高价值问题，默认优先用选项式问题（A/B/C + 其他）逐步降低 ambiguity
4. 在用户确认后进入 `route`
5. 形成 final route（L0/L1/L2/L3）
6. 再进入 `design -> plan -> tdd -> verify`
7. 明确下一个 artifact / gate / 恢复入口
8. 在 clarify-ready 之前，不得给“跳过 clarify 直接进 design/plan”的逃逸路径

若需要最小 change 资产但当前还没有，可优先驱动或建议：

```bash
node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]
```

### 模式 B：用户想继续当前 change
优先检查：

- `harness/ACTIVE_CHANGE`
- 对应 `state.json`
- 当前 blockers / decisions / validation 状态
- 当前位于哪个 workflow stage
- 当前需要哪个 exploration lane（如 `code-explore` / `doc-research` / `impact-explore`）先补事实

然后回答：

- 当前做到哪一阶段
- 下一步应该进哪个 gate / stage
- 是否需要 clarify 确认 / design / RED / validation 证据
- 如果现在打断，下次应从哪个入口恢复

### 模式 C：用户问“我该跑哪个命令”
不要泛泛而谈，直接按目标给出命令；但要明确这些都是 `/harness` 背后的后台动作，而不是新的用户入口：

- 新机器接入（维护者 / 排障者）：`bootstrap` → `setup-local-adapter --write` → `doctor` → `sync`
- 新 change 后台建档：`start-change`
- 本地 contract 检查：`verify`
- 上游盘点：`upstream-check`

### 未初始化目标项目的约束

- 若当前项目还没有 harness 资产或 runtime 初始化信息，不得因为缺少 `.harness/`、bootstrap marker、或本地 adapter 而阻断普通用户继续通过 `/harness` 进入澄清流程
- 对普通用户，这类缺口只能作为“维护者可后续补 bootstrap/doctor/sync”的建议，不能当作必须先完成的前置条件

### 模式 D：用户想发版 / 做发布动作
优先区分：

- 是仓库文档和 release 文案整理
- 还是 runtime / package / tag / GitHub Release 动作

若是后者，应明确：

- 当前版本
- 是否需要 bump
- 是否需要 tag / PR / merge / release
- 是否已有对应 release note

## Stage Routing 最低要求

`/harness` 应把当前 active change 与 durable artifacts 映射成下一步阶段，而不是只输出泛化建议。

最低应遵循：

- 若当前没有 active change：先引导或驱动创建 change，再进入 `clarify`
- 若 `requirements.md` 缺失、clarify 未达标、或用户尚未确认执行范围：继续 `clarify`
- 若 clarify-ready 且 `state.json.state` 仍在 `DRAFT` / `DISCOVERED`：进入 `route`
- 若 route 已形成但 `design.md` 缺失、关键 section 不完整、或 design approval 不存在：进入 `design`
- 若 design 已批准但 `tasks.md` 仍是 draft、缺 touched files / RED point / acceptance checks、或 plan verdict 仍不可消费：进入 `plan`
- 若 `state.json.state` 为 `TASKED` / `EXECUTING`，或当前 task 仍缺 RED / GREEN / REFACTOR 证据：进入 `tdd`
- 若实现已完成且需要 reviewer / validation 收口，或 `state.json.state` 为 `REVIEWED` / `VALIDATED` 但 validation 仍缺解释：进入 `verify`
- 若 validation 已 fresh 且完成声明成立：进入 `archive`
  - archive 阶段应在用户确认需求完成后，用 `node harness/plugin/runtime/cli.mjs lifecycle archive <changeId>` 把 change 物理归档到 `harness/archive/`（仅 VALIDATED 可归档；被 runtime smoke 引用的 change 会被拒绝）
  - 归档是收尾动作，不改变"用户只感知 `/harness`"——它由本阶段自动驱动，用户无需记忆该命令

在任何阶段，都应优先给出：

1. 当前 stage
2. 当前缺口（artifact / approval / evidence）
3. 推荐恢复入口（skill 或 backend command）
4. 若事实不足，推荐先走哪个 exploration lane（`code-explore` / `doc-research` / `impact-explore`）
5. 当前为何还不能进入下一阶段
6. 若已存在 machine-readable workflow state，则显式引用 `workflow.stage`、`workflow.clarifyReady`、`workflow.userConfirmedScope` 等字段解释当前判定

## Exploration Lane Routing 最低要求

- 若问题是多模块代码事实不清：优先 `code-explore`
- 若问题是外部库 / 框架 / SDK / 版本行为不清：优先 `doc-research`
- 若问题是 API / data / architecture / rule 影响面不清：优先 `impact-explore`
- clarify 阶段应优先补事实再问用户，不得先问用户去替系统做 repo discovery
- verify 阶段可再次调用独立 exploration lane 做事实复核

## 与 `harness-intake` 的关系

- `/harness` 是**总入口 / stage orchestrator**
- `harness-intake` 是**clarify / route 子流程入口**

当问题本质上是“开始一个需求工作流”时，你可以直接按 `harness-intake` 的 clarify-first 顺序执行，不必把用户来回踢给别的入口。

## 强制前置检查

**所有用户请求都必须先通过 `/harness` 进入 SOP，不得跳过。**

### 为什么前期要重
即使请求看起来很简单（如修 bug、读代码），也必须先走 `/harness` 进入 SOP。因为：
1. 统一入口便于追踪
2. 便于后续在 router 层优化成快速路径
3. 便于区分"需求类"和"非需求类"操作

### 后续优化方向
当 SOP 运行稳定后，可以在 router 层增加快速路径：
- 简单 bug fix → 可跳过完整 clarify，直接进入 fix 流程
- 纯读代码 → 可直接执行，无需 SOP
- 但这些优化必须建立在 SOP 已经稳定运行的基础上

### 强制约束
- **所有用户请求**：必须先通过 `/harness` 进入 SOP
- **需求类请求**：未完成 clarify / route，不得开始编写业务代码
- **非需求类操作**：可以走快速路径，但必须由 router 决定，不得自行跳过 `/harness`

## 禁止事项

- reviewer 返回 block，不得进入下一阶段
- 不得把 hooks 当成总编排器
- 不得把 command 当成需求分析器
- **不得在未完成 clarify / route 前直接进入实现**
- 不得在未完成 clarify / route 前开始编写任何 Java/JS 业务代码
- 不得在未观察到 `RED_VERIFIED` 证据前修改生产源码
- 不得在 codegraph 可用时跳过 codegraph-first
- 不得把 exploration dump 直接堆进主 orchestrator 上下文
- 不得把”skill 可能被模型选中”误表述成”像 hook 一样自动触发”
- **收到用户需求后，如果当前没有 active change，不得跳过 `/harness` 直接开始写代码**
