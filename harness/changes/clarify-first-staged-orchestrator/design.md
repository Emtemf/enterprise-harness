# Design

## Requirement Alignment

本 change 的目标不是继续为现有 `/harness` 增加说明文字，而是把当前骨架升级成一个 **Claude Code-only 的 clarify-first staged orchestrator**。

它必须回答以下核心问题：

1. Claude Code-only 场景下，真正的一等扩展面是什么，哪些层负责入口、治理、worker、durable state、backend？
2. 需求澄清是否应从“必要时才做”升级为**强制第一阶段**，并采用苏格拉底式、一问一答、ambiguity gating 的方式？
3. `clarify -> route -> design -> plan -> tdd -> verify -> archive` 是否应成为新的主阶段模型？
4. `/harness` 如何成为单一前门和 stage orchestrator，而不是只是一个流程说明 skill？
5. 在企业常见的 200k 级上下文限制下，如何通过 read-only exploration subagent 与 context packet 保持主 orchestrator 上下文干净？

## Current-State Evidence

基于本次 codegraph 与公开参考探索：

- 当前 `/harness` skill 已明确三层模型：`Skill=编排`、`Command=本机/runtime 确定性动作`、`Hooks=自动提醒/阻断/校验`
- 当前 `.claude/settings.json` 已经是标准 Claude Code hook wiring，说明主架构应建模成 repo-native `.claude` 扩展层，而不是先建模成外部分发 plugin
- 当前 `SessionStart` 只输出当前阶段/静态快照/动态真相/下一步命令，尚未把“当前 stage / 下一个阶段”产品化
- 当前 `Stop` 已消费 validation freshness 与 durable handoff guidance，但尚未把“停在哪一阶段、下次从哪恢复”产品化
- 当前 runtime CLI 已形成 backend hub（`start-change` / `status` / `verify` / `doctor`），说明 backend 层已存在，但仍与用户前门并列暴露
- `superpowers` 的公开结构与 skill catalog 证明：workflow-first、skills-first、自动提示下一步、subagent 作为默认执行模式是可行的 methodology 产品形态
- `deep-interview` 公开 skill contract 证明：一问一答、ambiguity scoring、weakest-dimension targeting、先探索再问、显式执行确认、支持中断恢复，适合作为本项目 clarify 阶段机制基础

## Options Considered

### Option A：继续沿用当前 intake-first + manual stage jumping
保留当前 `/harness` + `harness-intake` 结构，仅在文档中进一步强调 `/harness` 是统一前门，不改 clarfiy/design/plan/TDD/verify 的阶段 contract。

### Option B：做成 clarify-first staged orchestrator，但仍以主 agent 内联探索为主
将流程阶段化，并把 clarify 升级为强制第一阶段；但代码探索、文档调研仍主要在主 agent 上下文中直接完成。

### Option C：做成 clarify-first staged orchestrator + exploration subagent + durable context packet
在 Option B 的基础上，明确把高噪声探索下沉为 read-only subagent 能力，由主 orchestrator 只消费压缩过的 exploration packet/context packet，并以此驱动用户提问、design、plan、TDD 与 verify。

## Selected Option and Rationale

选择 **Option C**。

理由：

- 仅仅强调 `/harness` 为单入口（Option A）无法解决“需求不清就往 design/plan/TDD 推进”的根本问题
- 只做 clarify-first 但不下沉探索（Option B）会让主 orchestrator 承担过多代码/文档噪声，难以适配企业常见的 200k 级上下文限制
- Option C 同时吸收：
  - `superpowers` 的 workflow-first、skills-first、自动推进体验
  - OpenSpec 式 durable artifacts 与 gate/source-of-truth 设计
  - `deep-interview` 的苏格拉底式 clarfiy-first 机制
  - 当前仓库已经存在的 state machine / validation freshness / change assets / runtime backend 基础
- 这样得到的是一个比单纯 skill catalog 更强、比单纯 artifact contract 更顺滑的 orchestrator 形态

## Rejected Options

### 拒绝“当前主架构直接建模成外部分发 plugin”
因为 Claude Code 当前对 repo-local 项目真正的一等扩展面是 `.claude/skills`、`.claude/settings.json` hooks、`.claude/agents`、`.claude/rules`；`harness/plugin/manifest.json` 只是你们自己的 runtime/adapter contract，不是 Claude Code 官方 plugin API。

### 拒绝“什么探索都由主 agent 直接做”
因为这样会让 clarfiy/design/verify 阶段共享同一堆原始代码与文档噪声，主 orchestrator 很快会被污染，无法稳定保留高价值业务上下文。

## Affected Layers

- **Entry surface**：`.claude/skills/harness` 及后续 stage skill
- **Governance / hook layer**：`.claude/settings.json` 对应 handlers、SessionStart/Stop/写入 gate
- **Worker layer**：`.claude/agents/` 中的 reviewer / explorer / planner 角色，以及新增的 exploration contract
- **Durable workflow state layer**：`harness/specs/`、`harness/templates/`、`harness/changes/<change-id>/`
- **Backend/runtime layer**：`harness/plugin/runtime/*` 中的 `status/start-change/verify/doctor` 等 backend hub

## Cross-layer Responsibility Matrix

| Layer | Responsibility |
|---|---|
| `.claude/skills/` | 用户入口、阶段路由、阶段说明、模板装配 |
| `.claude/settings.json` hooks | 自动提醒、阻断、阶段恢复提示、freshness 保护 |
| `.claude/agents/` | read-only exploration / reviewer / planner / verifier workers |
| `harness/templates/` | requirements/design/tasks/validation 等 durable 模板 |
| `harness/specs/` | 长期稳定的 staged workflow / gate / artifact contract |
| `harness/changes/` | 每次 change 的 requirements/design/tasks/validation/reviews/state |
| `harness/plugin/runtime/*` | start-change / status / verify / doctor 等 backend 动作 |

## Phase and State Design

### New top-level workflow phases

```text
clarify
→ route
→ design
→ plan
→ tdd
→ verify
→ archive
```

### Existing durable change state relation

第一轮已经选择补充 machine-readable `state.json.workflow.*` 结构，并约定：

- 新 orchestrator 优先读取 `workflow.*`
- `state + approvals + currentTask + artifact presence` 只作为兼容 legacy change 的回退推断路径
- 本轮不再保留“扩展 `state.json.state`”与“完全依赖联合推断”并行候选表达

### TDD sub-state

TDD 阶段继续保留并强化现有思路：

```text
TEST_WRITTEN
→ RED_VERIFIED
→ GREEN_VERIFIED
→ REFACTOR_VERIFIED
```

且要求：
- 没看到 RED，不准改生产代码
- 没看到 GREEN，不准进入 verify
- REFACTOR 只允许在全绿后进行

## Clarify Contract

clarify 升级为**强制第一阶段**，不是“必要时才做”。

### Core mechanics
- 一次只问一个问题
- 每轮都计算 ambiguity score
- 每轮都显式针对 weakest dimension 发问
- 在问用户之前，优先通过代码/文档探索拿到仓库事实
- 只有 ambiguity score 达到阈值且用户明确确认后，才允许进入 `route`

### Recommended ambiguity dimensions
- Goal clarity
- Scope clarity
- User/actor clarity
- Data/SQL clarity
- Interface/API clarity
- Acceptance criteria clarity
- Constraint/risk clarity

### Recommended first version
- 采用 0-5 的维度评分制
- 所有关键维度 >= 4 且用户明确确认后视为 clarify-ready

### Durable artifact
新增或正式化：
- `requirements.md`

其至少记录：
- 原始需求
- 澄清后的目标与范围
- ambiguity score 摘要
- 关键假设与约束
- 用户确认后的 execution scope lock

## Exploration Subagent Contract

探索不再只是临时技巧，而是 orchestrator 的正式子系统。

### Principle
- 高噪声、高分支、高上下文消耗的探索：默认下沉为 read-only subagent
- 单点、小成本、定向确认：主 orchestrator 直接做

### Recommended exploration lanes
- `code-explore`
- `doc-research`
- `impact-explore`

### Exploration Packet
探索 subagent 不返回原始 dump，而返回压缩后的 exploration packet，至少包含：
- question
- scope
- facts
- uncertainties
- impact
- suggested user question
- sources

### Context Packet
主 orchestrator 在 clarify 完成后生成 compact 的 business context packet，供 design/plan/TDD/verify 与下游 subagent 复用；避免每个 agent 重读全量对话。

## Design Gate Contract

`design` 阶段必须企业化，不能只停留在高层思路。

### Required sections in `design.md`
1. Problem / Goal
2. Scope / Non-goals
3. Affected modules
4. Interface contract
5. Data / SQL design
6. Flow / state changes
7. Architecture boundary
8. Risk / rollback
9. Test strategy

### Required enterprise checks
- 接口：API / internal service / compatibility
- SQL / 数据：schema / migration / rollback / constraints
- 代码规范 / 架构边界：层次、对象职责、映射责任
- 测试策略：unit / integration / API E2E / RED path

## Plan Gate Contract

`plan` 阶段解决的是“如何机械执行”，而不是再做一遍架构。

### Required sections in `tasks.md`
1. touched files
2. implementation order
3. test-first order
4. RED evidence point
5. GREEN evidence point
6. refactor boundary
7. commands
8. acceptance checks

### Gate
- plan 必须可被 `plan-critic` 无猜测执行
- 不允许“实现时再想”的占位说明

## Verify Gate Contract

`verify` 吸收 superpowers 的 verification-before-completion，但加强为：
- reviewer verdict
- command evidence
- skipped items
- validation freshness
- final verdict

Stop 与 verify 的职责边界：
- `verify` 是 reviewer verdict / validation freshness 的主要机械消费点
- `Stop` 保持 freshness / 完成态保护与阶段恢复提示

## Hook Behavior Boundaries

### SessionStart
负责：
- 当前 active change
- 当前 stage
- 当前 gate 状态
- 推荐下一步 `/harness <stage>` 或 `/harness`

不负责：
- 承担完整 workflow 决策

### PreToolUse / PostToolUse
负责：
- 写入前 gate
- 写入后 freshness 标脏
- 必要时提示已可进入下一阶段

不负责：
- 替代 orchestrator 路由

### Stop
负责：
- 验证 freshness / 完成态保护
- 提示当前停在哪一阶段
- 提示下次从哪个入口恢复

不负责：
- 自动替代用户完成 handoff 资产写入

## Trace and Telemetry

本项目需要记录交互与阶段推进，以打磨 harness，但必须与 repo durable truth 分层。

### Layer A: repo durable truth
- requirements/design/tasks/validation/reviews/state/evidence

### Layer B: trace / telemetry
- 澄清轮次问题与回答
- ambiguity score 变化
- subagent 调用与上下文消耗
- 阶段切换点
- 用户打断点
- reviewer block 点

本轮先冻结分层原则，不要求第一轮就完成全部 trace 基础设施。

## Testing Strategy

本轮后续实现至少应覆盖：

1. clarify-first contract 的最小 smoke
2. `/harness` stage routing 的最小 smoke
3. requirements/design/tasks/validation 模板 presence 与结构 smoke
4. SessionStart/Stop 的阶段恢复提示 smoke
5. exploration packet / context packet 的最小 contract 测试

同时要避免“只改文档不建 RED/green harness”的回归，至少每个核心 task 都要有对应 smoke 的失败断言与成功判据。

## Rollout and Rollback

- rollout：先冻结 staged workflow / clarify-first contract / templates / hooks guidance 的最小闭环，再逐步把 orchestrator 和 subagent 路由接入
- rollback：若自动推进或 clarify gate 设计过重，可先回退 runtime 消费逻辑，但保留 durable spec 与模板设计

## Risks

- clarify 机制过重会拉长简单需求路径，因此需要保留“低歧义快速通过”的阈值设计
- ambiguity score 如果设计太复杂，会降低可解释性与可执行性
- exploration subagent 若无标准返回格式，会把上下文噪声从主 agent 转移到 artifact 层
- 如果过早追求 multi-host packaging，会稀释当前 Claude Code-only 主线
- hooks 若承担太多编排逻辑，会破坏当前清晰的三层边界

## Open Questions

1. `review` 是否需要作为独立主阶段，还是继续并入 `verify`？
2. ambiguity score 初版是否显示所有维度，还是只显示 weakest dimension 与总分？
3. trace/telemetry 第一轮是否先落到 change evidence，还是另建专用 trace 目录？

## Design Self-Review

- requirement coverage：已覆盖 clarify-first、stage routing、templates、exploration subagent、hooks guidance、durable state 分层
- scope：保持在 Claude Code-only staged workflow 主线，不扩散到 multi-host packaging-first 改造
- testability：每个核心 contract 均可通过 smoke / fixture / reviewer verdict / state artifact 做定向验证
- risk control：先冻结分层与阶段 contract，再接 orchestrator/runtime 行为，避免先写实现后补设计

## Approval

本轮设计完成后，下一步应形成正式 `tasks.md`，并获取 `design-reviewer` 与 `plan-critic` 可消费的 stage/task artifact，再逐步进入实现。