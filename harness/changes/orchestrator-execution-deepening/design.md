# Design

## Requirement Alignment

本 change 承接 `clarify-first-staged-orchestrator` 第一版骨架收口后的下一阶段工作。

上一条主线已经完成了：

- staged workflow contract
- templates contract
- `/harness` stage-router contract
- SessionStart / status guidance contract
- exploration / ambiguity / context contract
- workflow state contract 与其 consumption
- 最小 workflow runner (`run|resume|status|decide`) 的基础能力与 smoke

因此本轮设计不再重复做“骨架是否存在”的问题，而是把目标收窄为：

> **把现有 workflow runner、runtime stage routing 与 automation-first progression 从“骨架可验证”推进到“更真实执行期行为可用”。**

## Current-State Evidence

当前仓库已经具备的事实：

- `clarify-first-staged-orchestrator` 已进入 `VALIDATED`，第一版骨架相关 smoke 全部通过
- `workflow.mjs` 已支持：
  - `run`
  - `resume`
  - `status`
  - `decide`
- `buildWorkflowResult()` 已产出 machine-readable 字段：
  - `state`
  - `stage`
  - `status`
  - `nextAction`
  - `pendingDecision`
  - `recommendedLane`
  - `currentGap`
- `session-start.mjs` 与 `status-summary.mjs` 已能根据 active change 给出：
  - 当前 stage
  - 当前缺口
  - 推荐恢复入口
  - 普通用户优先提示
- `workflow-runner-smoke.mjs` 已证明 runner 能在真实 change 上做 `run/resume/status`
- `workflow-decision-smoke.mjs` 已证明 runner 能处理最小 human checkpoint（`confirm-scope`）

当前主要缺口：

1. runner 还主要停留在“能返回状态”，而不是“能稳定代表 execution deepening progression”
2. `decide` 当前只覆盖 very narrow decision kinds（scope confirmation / design approval），还缺 execution deepening 的最小 checkpoint contract
3. `status/session-start/stop` 已会提示，但还缺 execution deepening 场景下更稳定的一致消费
4. active change 切换与 project snapshot 之间容易漂移，需要更明确的 next-phase progression evidence

## First Minimal Execution-Deepening Contract

为避免 plan 和实现继续猜测，本轮第一批 execution deepening 只固定一个最小场景：

- **Scenario name**: `execution-readiness`
- **Workflow stage**: 继续落在 `workflow.stage = "design"` 之内
- **Goal**: 在新主线 change 已完成 clarify 并进入 design 后，让 runner/status/session-start/stop 能稳定表达“当前正处于 execution deepening 的设计收口场景”，并通过一个最小 human checkpoint 推进到 plan

### Minimal pendingDecision contract

本轮只新增一个新的 `pendingDecision.kind`：

- `execution-readiness`

其 machine-readable 形态至少包含：

- `kind = "execution-readiness"`
- `message = "需要确认 execution deepening 第一批切片是否已冻结，可以进入 plan。"`
- `options = ["freeze-slice", "revise-slice"]`
- `evidence = ["harness/changes/<change-id>/design.md"]`

### Precondition

仅当同时满足以下条件时，runner 才应产出 `execution-readiness` checkpoint：

- `workflow.stage = "design"`
- `workflow.clarifyReady = true`
- `workflow.userConfirmedScope = true`
- `requirements.md`、`change.md`、`design.md` 已存在
- `state.json.approvals.design.status` 已存在且不是 `block`
- `gates.designApproved = false`

这里的 **reviewer truth source** 明确固定为：

- `reviews/design-reviewer.json` 是 **durable authoritative truth**
- `state.json.approvals.design` 是 **runtime-consumed projection**
- runtime runner / shared inference **只消费** `state.json.approvals.*` 与 `gates.*`
- `lib/checks.mjs` / repo verify 负责校验：
  - reviewer artifact 存在
  - reviewer artifact 与 `state.json.approvals.design` 一致
  - reviewer 身份与 verdict 合法
- 若 durable artifact 缺失，或 artifact 与 projection 不一致，则视为 verify/gate 失败；本轮 runner 不自动修复漂移。
- `freeze-slice` 的 drift failure 路径固定为：
  - `workflow decide <change-id> freeze-slice` 在执行前调用同一套 reviewer/projection consistency helper
  - 若 helper 返回 drift / missing-reviewer-artifact，则命令级 exit != 0
  - 不推进 `gates.designApproved`、`workflow.stage`、`state`

### Legal status of `execution-readiness`

`execution-readiness` **不是**新的独立 design reviewer verdict，也**不是**第二套 design gate。

它的地位是：

- 在已有 `design-reviewer` verdict 基础上的**人类执行检查点**
- 作用是确认 execution deepening 第一批切片已冻结，可以正式进入 plan
- 正式的 design review 事实仍由 `reviews/design-reviewer.json` 提供
- 正式的 design gate 落点仍是 `gates.designApproved = true`

### Decision semantics

#### `freeze-slice`
执行前必须先满足一条额外 gate：

- `reviews/design-reviewer.json` 存在
- durable reviewer artifact 与 `state.json.approvals.design` projection 一致
- 若 artifact 缺失或与 projection 漂移，则 `freeze-slice` 必须失败，不能推进到 `plan`

执行后至少应更新：

- `gates.designApproved = true`
- `workflow.stage = "plan"`
- `workflow.nextEntry = "/harness-plan"`
- `workflow.planReady = false`
- `state = "DESIGN_APPROVED"`
- `approvals.design` 保持由 `design-reviewer` 产生的原始 reviewer verdict，不改写 `reviewerId`

#### `revise-slice`
执行后至少应更新：

- `gates.designApproved = false`
- `workflow.stage = "design"`
- `workflow.nextEntry = "/harness-design"`
- `workflow.planReady = false`
- `state` 保持不变
- `approvals.design` 保持原 reviewer verdict，不由 human checkpoint 覆盖

### Shared inference owner

为避免 guidance 漂移，本轮明确：

- `harness/plugin/runtime/lib/workflow.mjs` 是 `stage / currentGap / workflow.nextEntry / pendingDecision` 推断的单一 owner
- `workflow.mjs`、`status-summary.mjs`、`session-start.mjs`、`stop.mjs` 只消费共享推断结果，不再复制独立推断语义
- `harness/plugin/runtime/lib/checks.mjs` 是 **review artifact ↔ runtime projection 一致性校验 owner**：
  - 校验 `reviews/design-reviewer.json` 存在
  - 校验其与 `state.json.approvals.design` projection 一致
  - 若缺失或漂移，则 repo `verify` 失败
- `workflow.mjs` / `lib/workflow.mjs` 不直接读取 reviewer 文件，只要求其 projection 已存在且未被 `checks.mjs` 判定漂移
- 本轮 plan/TDD 完成后，`harness/plugin/runtime/hooks/stop.mjs` 应改为直接消费 shared helper，而不是继续内嵌本地 `inferWorkflowStage()` / `recommendNextEntry()` 复制逻辑

## Scope / Non-goals

### Scope

- 深化 `harness/plugin/runtime/workflow.mjs` 的 execution-phase 行为
- 深化 `harness/plugin/runtime/lib/workflow.mjs` 的 stage/gap/next-action 推断
- 深化 `harness/plugin/runtime/lib/status-summary.mjs` 的 progression summary
- 深化 `session-start.mjs` / `stop.mjs` 在 execution-phase 的恢复提示
- 对齐 `.claude/skills/harness/SKILL.md` 与 runtime runner 的行为预期
- 新增或补强 execution deepening smoke / verification evidence

### Non-goals

- 不重复补 staged workflow contract / template contract 本身
- 不重复做 `/harness` 普通用户单入口文案收口
- 不在本轮扩到 Java / OpenAPI / business implementation
- 不在本轮做公共 marketplace / package distribution
- 不在本轮新造第二套 workflow runner，而是继续收紧现有 `workflow.mjs`

## Options Considered

### Option A：重新开一套 execution runner
优点：概念隔离更强。
缺点：会重复已有 `workflow.mjs`，增加双轨维护成本。

### Option B：继续收紧现有 `workflow.mjs` 与 `lib/workflow.mjs`
优点：延续当前 machine-readable contract 与 smoke 基线；更适合 incremental deepening。
缺点：需要在现有文件中谨慎演进语义。

### Option C：只补 status / session-start，不碰 runner
优点：改动面小。
缺点：只能改善展示，不能真正推进 execution-phase 行为。

## Selected Option and Rationale

选择 **Option B**。

理由：

- 当前 repo 已经把 `workflow.mjs` 作为最小可用 runner 固化下来
- `workflow-runner-smoke.mjs` 与 `workflow-decision-smoke.mjs` 已提供可继承的 RED/GREEN oracle
- 继续深化现有 runner 比新开一套更符合当前 repo 的 single-entry / single-runner 原则
- 仅补 status 展示（Option C）无法触及真正的 execution progression 问题

## Affected Modules

- `harness/plugin/runtime/workflow.mjs`
- `harness/plugin/runtime/lib/workflow.mjs`
- `harness/plugin/runtime/lib/status-summary.mjs`
- `harness/plugin/runtime/lib/checks.mjs`
- `harness/plugin/runtime/status.mjs`
- `harness/plugin/runtime/hooks/session-start.mjs`
- `harness/plugin/runtime/hooks/stop.mjs`
- `.claude/skills/harness/SKILL.md`
- execution deepening smoke tests
- `harness/changes/orchestrator-execution-deepening/*`
- `PROGRESS.md`（仅在 snapshot/summary 同步需要时微调，非动态 SoT）

## Interface Contract

### User-facing contract

普通用户仍然只看到：

- 安装后从 `/harness` 开始

本轮不改变这个前门，只增强其背后的：

- 当前阶段识别
- 下一步动作
- 恢复入口
- execution-phase guidance

### Runtime workflow contract

`workflow status --json`、`workflow run`、`workflow resume`、`workflow decide` 应继续保证 machine-readable 输出至少包含：

- `changeId`
- `state`
- `stage`
- `status`
- `nextAction`
- `pendingDecision`
- `recommendedLane`
- `currentGap`
- `workflow.nextEntry`

本轮新增/收紧的 contract 重点应是：

- execution-phase 下 `status` / `nextAction` 的更稳定语义
- 更多真实 progression decision 的可消费表达
- currentGap / `workflow.nextEntry` / lane 推断在 active change 切换后的稳定性

### Field ownership

为避免 runner/status-summary/session-start 三层继续混用字段，本轮明确：

- `workflow.nextEntry`：属于 **runner / workflow status** 层字段，用于内部 stage 恢复入口
- `recommendedEntry`：属于 **repo-level status summary** 层字段（由 `buildStatusSummary()` 产出），用于普通用户默认推荐入口
- 对普通用户的 user-facing 策略固定为：
  - repo-level `status`
  - SessionStart
  - Stop handoff guidance
  默认优先指回 `/harness`
- execution deepening 的 smoke 必须分别断言：
  - runner 类命令断言 `workflow.nextEntry`
  - repo-level status / session-start / stop 类断言 `recommendedEntry = "/harness"`

## Data / SQL Design

- 不适用。
- 本 change 不涉及 Java 四层、repository port、DTO/Req/Rsp/Entity/Mapper 责任调整；这些规则本轮为 N/A。

## Flow / State Changes

### Baseline

当前 first skeleton 已完成后，runner 已能：

- `run`: 创建或激活 change，并返回当前 lifecycle object
- `resume`: 恢复 active change
- `status`: 输出当前 machine-readable status
- `decide`: 处理最小 human checkpoint

### This change deepens

本轮第一批切片应优先覆盖：

1. **Execution-phase status progression**
   - 当 active change 已完成上一阶段骨架、进入 execution deepening 时，`status` / `session-start` / `stop` 应稳定表达当前 gap 与 next action

2. **Decision surface deepening**
   - 让 `decide` 不只处理 clarify/design 最小检查点，而是为 execution progression 预留更现实的 checkpoint 形态

3. **Snapshot synchronization**
   - 让 project snapshot / active change / workflow status 的叙事更一致，减少“active 已切换但快照仍旧停留在前一个 change”的情况
   - 这里的 user-facing 规则固定为：
     - repo-level `recommendedEntry` **始终代表普通用户默认入口 `/harness`**
     - active change 的内部阶段恢复入口继续由 `workflow.nextEntry` 表达
     - 因此 snapshot sync smoke 只要求 repo-level `recommendedEntry = "/harness"`，不得镜像内部 `workflow.nextEntry`

## Architecture Boundary

- 继续保持 `.claude/skills/harness` 作为总入口
- 继续保持 `workflow.mjs` 作为 runtime backend runner
- 继续保持 `status-summary.mjs` / SessionStart / Stop 作为自动 guidance 层
- 不引入第二套并行 runner
- 不把 hooks 升级成总编排器

## Risk / Rollback

### Risks

- 若 runner 语义演化过快，可能破坏既有 smoke contract
- 若 `status` / `session-start` / `stop` 各自独立演进，可能再次造成 guidance 漂移
- 若把 execution deepening 和未来业务执行期行为混在一起，scope 会膨胀

### Rollback

- 优先通过新增 smoke 锁定 contract，再做最小实现
- 若 execution deepening contract 不稳定，可回退到当前已通过的 first-skeleton runner 行为
- 不删除现有 machine-readable 字段；只允许新增或更精确定义

## Test Strategy

### Unit

- 不引入传统单元测试；本轮仍以 deterministic runtime smoke 为主。

### Integration / Smoke

本轮第一批应新增或补强的 smoke：

1. **workflow-execution-status-smoke**（新增）
   - fixture：temp repo 中的 `execution-status-smoke` change
   - 初始状态：
     - `state = "DISCOVERED"`
     - `workflow.stage = "design"`
     - `workflow.clarifyReady = true`
     - `workflow.userConfirmedScope = true`
     - `workflow.planReady = false`
     - `workflow.nextEntry = "/harness-design"`
     - `state.json.approvals.design.status = "advisory"`
     - `state.json.approvals.design.reviewerId = "design-reviewer"`
     - `reviews/design-reviewer.json` 存在且与 `state.json.approvals.design` projection 一致
   - verify oracle：
     - `workflow status --json` 精确返回：
       - `changeId = "execution-status-smoke"`
       - `stage = "design"`
       - `pendingDecision.kind = "execution-readiness"`
       - `workflow.nextEntry = "/harness-design"`
       - `nextAction = "workflow decide execution-status-smoke freeze-slice"`
     - `session-start` 输出中至少必须出现：
       - `[Harness Workflow] 当前 stage: design`
       - `[Harness Workflow] 推荐恢复入口: /harness`
       - `[Harness Workflow] 下一步动作: workflow decide execution-status-smoke freeze-slice`
     - repo-level `status` 输出中至少必须出现：
       - `普通用户下一步命令`
       - `- /harness`
       - `推荐恢复入口`
       - `- /harness`
     - `stop` 输出中至少必须出现：
       - `- 当前 workflow stage：design`
       - `- 建议下次从：/harness 恢复`

2. **workflow-progression-decision-smoke**（新增）
   - fixture：同上 temp repo change
   - CLI syntax contract：`workflow decide <change-id> <decision> [reason]`
   - RED oracle：当前 `decide` 不识别 `execution-readiness` 场景下的 `freeze-slice` / `revise-slice`
   - GREEN oracle：
     - 对 `freeze-slice`：
       - `gates.designApproved = true`
       - `state = "DESIGN_APPROVED"`
       - `workflow.stage = "plan"`
       - `workflow.nextEntry = "/harness-plan"`
       - `pendingDecision = null`
       - `nextAction = "/harness-plan"`
     - 对 `revise-slice`：
       - `gates.designApproved = false`
       - `workflow.stage = "design"`
       - `workflow.nextEntry = "/harness-design"`
       - `state = "DISCOVERED"`
       - `pendingDecision = null`
       - `nextAction = "/harness-design"`
       - `currentGap = "execution deepening 切片仍需修订。"`
       - `approvals.design` deep-equal 保持原 reviewer projection
       - `suppressionBaseline.designMdSha256` 被持久化
     - `revise-slice` suppress `execution-readiness` 的唯一原因固定为：
       - 该 decision event 已被持久化到 `workflow-events.jsonl`
       - `suppressionBaseline.designMdSha256` 记录了当次 `harness/changes/<change-id>/design.md` 的内容 hash
       - 且在该 hash 再次变化前，shared inference 必须优先返回 `currentGap = "execution deepening 切片仍需修订。"`，而不是重新产出 `pendingDecision.kind = "execution-readiness"`
       - 只有 `design.md` 内容 hash 变化，才允许 reopening `execution-readiness`

3. **snapshot-active-change-sync-smoke**（新增）
   - fixture：在 temp repo 中先切 active change，再运行 `status` / `session-start`
   - verify oracle：
     - repo-level `status --json.activeChange.changeId = "sync-smoke-b"`
     - repo-level `recommendedEntry = "/harness"`
     - repo-level `currentGap = "缺少 requirements.md。"`
     - `workflow.nextEntry` 仍只属于当前 active change 的内部状态层，不被 repo summary 镜像
     - `PROGRESS.md` 只保留静态快照角色，不覆盖 dynamic truth

4. **repo verify**（沿用）
   - `node harness/plugin/runtime/cli.mjs verify --json`
   - 作为每个 task 的 verify 以及三项任务完成后的 bundle verify
   - 必须保持 `contractChecks.ok = true`

### Why these are the first slices

因为它们对应 execution deepening 的三个最小真实痛点：

- runner 不只是“能返回状态”，而是能表达 execution progression
- decision 不只是“有这个命令”，而是能消费更真实 checkpoint
- snapshot / status / active change 不再彼此漂移

这三件事一起，才能把项目从“骨架已存在”推进到“下一轮真实执行更少依赖人工解释”。

## Design Self-Review

- 本轮设计明确与上一条 change 做了边界切割：上一条收口骨架，本轮深化 execution behavior
- 设计避免重新发明第二套 runner，而是继续强化现有 `workflow.mjs`
- 第一批切片优先瞄准 status/decision/snapshot 三个最影响真实执行体验的地方，符合最小执行范围原则

## Approval

- 待 design review
