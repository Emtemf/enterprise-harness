# Clarify-First Staged Workflow 规范

## 目标

把当前 Enterprise Harness 收敛成一个 **Claude Code-only 的 clarify-first staged orchestrator**：

- 用户从单一入口 `/harness` 进入
- workflow 按阶段推进，而不是靠聊天自由漂移
- 每个阶段都有 durable artifact、gate 与 reviewer/verification 消费点
- 高噪声探索默认下沉到 read-only subagent，主 orchestrator 只保留压缩后的业务上下文与阶段状态

## 适用范围

本规范适用于所有 L1 及以上的仓库级变更；L0 文档变更可不完整走完所有阶段，但不得伪装为 clarify/design/plan/TDD 已完成。

## 单一入口原则

### 用户入口
Claude Code 会话中，统一从：

- `/harness`

进入。

这是**唯一的主用户入口**。阶段 skill（如 `harness-intake`、`harness-design`、`harness-plan`、`harness-tdd`、`harness-verify`）属于 subordinate stage entry：
- 可由 `/harness` 在当前阶段作为恢复入口推荐
- 也可由熟悉仓库 contract 的高级用户直接使用
- 但 repo-facing 文档、SessionStart、status、Stop 的默认指路应始终优先回到 `/harness`

### 入口职责
`/harness` 不是单纯的说明 skill，而是阶段编排器，负责：

1. 识别当前 active change 与当前阶段
2. 判断缺少哪些 artifact / approvals / evidence
3. 必要时自动调用探索 subagent 获取 repo 或文档事实
4. 把用户导入当前应进入的阶段 skill
5. 在 gate 满足时自动推进到下一阶段
6. 在用户打断后给出明确的恢复入口
7. 当需要人类决策时，返回结构化 `pendingDecision`，而不是靠聊天语气猜测批准

### 非入口对象
以下对象存在，但不是用户主入口：

- `harness-intake` 与后续 stage skill：subordinate stage entry，不是主用户入口
- `.claude/agents/`：专职 worker / reviewer
- `harness/plugin/runtime/cli.mjs ...`：backend/runtime 确定性动作
- `.claude/settings.json` hooks：自动治理与提示

## 阶段模型

主阶段顺序如下：

```text
clarify
→ route
→ design
→ plan
→ tdd
→ verify
→ archive
```

### clarify
目标：把 vague request 变成可执行需求。

最低要求：
- 一次只问一个问题
- 每轮更新 ambiguity score
- 显式针对 weakest dimension 发问
- 先通过 repo/documentation 探索拿事实，再问用户
- ambiguity 达标且用户显式确认后，才能进入 `route`

durable artifact：
- `requirements.md`

### route
目标：把澄清后的需求映射成 tier / owner / scope / impact / next gate。

最低要求：
- 完成 provisional triage
- 形成 final route
- 补齐 `change.md` 与 `state.json`

### design
目标：把需求变成可评审的企业设计，而不是直接跳到实现。

最低要求：
- `design.md` 完整
- 覆盖接口、SQL/数据、架构边界、测试策略
- `design-reviewer` 可评审
- 涉及 API 时，`api-consistency-reviewer` 可评审

### plan
目标：把 design 拆成可机械执行的实现计划。

最低要求：
- `tasks.md` 完整
- touched files / test-first order / RED point / GREEN point / acceptance checks 明确
- `plan-critic` 可无猜测执行

### tdd
目标：按 RED → GREEN → REFACTOR 执行，而不是先改生产代码再补测试。

最低要求：
- `TEST_WRITTEN`
- `RED_VERIFIED`
- `GREEN_VERIFIED`
- `REFACTOR_VERIFIED`

### verify
目标：在宣称完成前，统一消费 reviewer verdict、命令证据与 validation freshness。

最低要求：
- `validation.md` 补齐
- reviewer verdict 落盘
- stale validation 不得宣称完成

### archive
目标：在 durable artifacts 完整且 validation fresh 时结束当前 change。

## Gate 原则

### Clarify gate
在以下条件全部满足前，不得进入 `route`：

- ambiguity score 达到阈值
- 关键未知项已被显式记录或消解
- 用户已确认执行范围

### Design gate
在以下条件全部满足前，不得进入 `plan`：

- `design.md` 存在且关键 section 完整
- design review 非 `block`
- 需要 API consistency review 时，对应 verdict 不为 `block`

### Plan gate
在以下条件全部满足前，不得进入 `tdd`：

- `tasks.md` 已从 draft 收敛为正式 plan
- `plan-critic` verdict 不为 `block`
- touched files / test-first order / RED point 明确

### TDD gate
在以下条件全部满足前，不得进入 `verify`：

- 已观察到 RED
- 已观察到 GREEN
- 已在全绿后完成 REFACTOR 验证

### Verify gate
在以下条件全部满足前，不得进入 `archive` / 宣称完成：

- reviewer verdict 已落盘且 blocking reviewer 不为 `block`
- `validation.md` 存在
- `validation.status=fresh`

## Subagent Exploration 原则

探索默认分流为两类：

### 主 orchestrator 直接做
适用于：
- 单文件、单符号、低成本确认
- 当前上下文已足够说明行为

### read-only subagent 做
适用于：
- 多模块代码探索
- 外部文档调研
- 需要在问用户前先拿 repo 事实
- 预计会污染主上下文的高噪声探索

## Exploration Lane Routing

`/harness` 作为 orchestrator，最低应识别并按需调用以下 lane：

### `code-explore`
优先用于：
- 多模块代码探索
- controller / service / repository / mapper 关系梳理
- callers / callees / impact path 分析
- brownfield 需求在问用户前先确认 repo 事实

### `doc-research`
优先用于：
- 外部库、框架、SDK、版本行为问题
- Context7-first / vendor docs / 官方源码调研
- design/plan 阶段需要确认外部行为边界

### `impact-explore`
优先用于：
- API / data / architecture / rule 四类影响归纳
- route 阶段的 tier/impact 决策
- design/verify 阶段的影响面复核

### 最低选择规则
- clarify 阶段：优先决定是否需要 `code-explore` / `doc-research` 来补事实，再问用户
- route 阶段：优先决定是否需要 `impact-explore` 来固定影响矩阵
- design 阶段：若接口、SQL、调用方、兼容性边界不清，优先调 `code-explore` 或 `doc-research`
- verify 阶段：若完成声明与影响面之间仍有缺口，可再次调 `impact-explore` 做独立事实复核
- 不得为了低成本、单点确认而滥开 subagent

### Exploration Packet
探索 subagent 返回值至少包含：
- `question`
- `scope`
- `facts`
- `uncertainties`
- `impact`
- `suggestedUserQuestion`
- `sources`

### Context Packet
clarify 完成后，主 orchestrator 应生成一个 compact context packet，供 design/plan/TDD/verify 与下游 subagent 复用。该 packet 的稳定 contract 定义在：
- `harness/specs/context-packet.md`

最低应包含：
- business goal
- scope / non-goals
- constraints
- acceptance criteria
- domain glossary

## Hooks 边界

### SessionStart
负责：
- 当前 active change
- 当前阶段
- 推荐下一步 skill/command
- 恢复入口
- 在存在人类决策缺口时提示 pending decision 类型

不负责：
- 代替主 orchestrator 做完整阶段决策

### PreToolUse / PostToolUse
负责：
- 写入门禁
- freshness 标脏
- 阶段就绪提示

不负责：
- 作为主交互入口

### Stop
负责：
- freshness / completion protection
- durable handoff guidance
- 当前停留阶段与恢复提示

不负责：
- 自动替用户完成 change 资产写入

## Machine-readable Workflow State

为兼容现有 change，本仓库允许通过 legacy `state + approvals + validation` 推断 stage；但新的 clarify-first changes 应逐步补充 `state.json.workflow` 结构。这里的 machine-readable `workflow` 对象至少包括：

- `stage`: `clarify | route | design | plan | tdd | verify | archive`
- `clarifyReady`: 是否已达到 clarify-ready
- `userConfirmedScope`: 用户是否已确认执行范围
- `planReady`: 当前 plan 是否已可消费
- `tddStatus`: `not-started | test-written | red-verified | green-verified | refactor-verified`
- `nextEntry`: 推荐恢复入口（如 `/harness` / `/harness-design` / `/harness-plan` / `/harness-tdd` / `/harness-verify`）

要求：
- 新的 staged orchestrator 逻辑优先读取 `workflow.*`；若缺失，再回退到 legacy 字段推断
- `clarifyReady=true` 但 `userConfirmedScope=false` 时，不得进入 `route`
- `planReady=true` 仅表示 plan 可消费，不替代 `TASKED/EXECUTING` 等 change-level state
- `tddStatus` 只表达当前执行子阶段，不替代 reviewer / validation gate

## Durable Artifacts

每个 L1+ change 至少应可落盘并被后续阶段消费：

- `requirements.md`
- `change.md`
- `design.md`
- `tasks.md`
- `validation.md`
- `reviews/*.json`
- `state.json`
- `evidence/*.md`

聊天记录可以作为来源，但不能替代上述资产。

## Human Checkpoint / Pending Decision Contract

当自动推进不能安全继续时，runner 必须暂停并返回 machine-readable `pendingDecision`，而不是把批准/否决寄托在聊天语气里。

最低字段：
- `kind`
- `message`
- `options`
- `evidence`

典型场景：
- clarify 阶段缺 scope confirmation
- clarify 阶段仍需回答下一个高价值问题
- design 阶段需要 design approval
- release / waiver / 外部 side effect 需要显式人类决策

## Trace / Telemetry 分层

### Repo durable truth
进入仓库、可被 reviewer 与 hooks 消费：
- requirements/design/tasks/validation/reviews/state/evidence

### Trace / telemetry
用于调优 harness，但不直接等同于 repo 真相：
- 澄清轮次与 ambiguity score 变化
- subagent 调用与摘要
- 用户打断点
- 阶段切换点
- reviewer block 点

## 禁止事项

- 不得在 clarify 未达标时直接进入 design/plan/TDD
- 不得把 hooks 当成总编排器
- 不得把 backend command 当成需求分析器
- 不得把 exploration dump 直接堆进主 orchestrator 上下文
- 不得用聊天上下文替代 durable artifact
- 不得在 validation stale 或 reviewer block 时宣称完成
