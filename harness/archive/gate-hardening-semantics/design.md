# Design

## Requirement Alignment

本 change 对应 issue #11，目标不是补更多说明文档，而是把当前仓库已有但不完整的 gate 语义收敛成可继续实现的设计入口。

本轮设计至少要回答：

1. `designApproved` 在当前仓库中到底表示什么、由谁消费
2. plan / task gate 是否需要独立表达，如何落到 artifact 与 runtime
3. reviewer verdict 与 validation freshness 如何参与状态迁移

## Current-State Evidence

基于本次 codegraph 探索：

- `pre-write` 目前只在 governed path 上消费 `designApproved` 与 `redVerified`
- `stop` 只消费 stale validation 结束条件，不覆盖 plan/task gate
- `validateReviewVerdicts()` 当前只做 reviewer verdict 文件结构检查
- `lifecycle.mjs` 已有 `design-approved` / `red-verified` / `reviewed` / `validated`，但没有显式 `plan-approved` / `task-ready` 等动作

因此当前仓库的问题不是“完全没有 gate”，而是：

- gate 分布零散
- gate 覆盖不完整
- reviewer / validation verdict 没有被统一消费

## Options Considered

### Option A：直接往现有 runtime 上继续堆更多 gate key
在 `state.json.gates` 中继续增加 `planApproved`、`taskReady`、`reviewPass` 等键，并在 hooks 中分别消费。

### Option B：先明确状态机与 artifact 关系，再补 runtime gate 消费
先明确 design / plan / task / validation / reviewer verdict 的语义边界，再决定哪些必须成为显式 gate key，哪些只需要 state/artifact presence 即可表达。

## Selected Option and Rationale

选择 **Option B**。

理由：

- 当前仓库已经有状态机（`DRAFT -> ... -> VALIDATED`），但 plan/task gate 还没被正式表达
- 如果不先把 state / artifact / gate 的边界说清楚，继续堆 gate key 只会增加复杂度
- issue #11 的核心是“可执行且可解释的 gate 模型”，不是先把更多布尔值塞进 `state.json`

## Rejected Options

拒绝“直接继续加 gate key”作为第一步，因为它会让 runtime 行为先跑在设计前面，后续很难解释为什么某个 key 存在、由谁设置、在哪个状态消费。

## Affected Layers

- rules layer：需要明确 design / plan / task / validation / reviewer verdict 的语义边界
- specs layer：需要为证据、tasking、review consumption 建立稳定规范
- runtime layer：需要把最终选定的 gate 语义消费进 hooks / lifecycle / verify
- change artifacts：需要决定 `tasks.md`、`design.md`、`validation.md` 与 reviewer verdict 的消费方式

## Cross-layer Type and Mapper Matrix

本 change 不涉及 Java 类型映射；它涉及的是：

| Layer | Responsibility |
|---|---|
| `.claude/rules/` | 定义 gate 与 workflow 语义 |
| `harness/specs/` | 定义可落盘、可复核的长期规范 |
| `harness/plugin/runtime/` | 消费显式 gate / artifact / state |
| `harness/changes/` | 承载每次 change 的设计、task、validation、review 证据 |

## Repository Port Design

不适用。本 change 不涉及 Java repository port。

## API Contract

不适用。本 change 不直接改变对外 API。

## Data Design

不涉及业务数据结构；`impact.data = no` 仅表示**业务数据/持久化数据不变**。本轮会触及 governance contract（如 state / task / review / validation 的消费关系），但该影响归类到 `architecture` 与 `rule`，而不是业务 data 变更。

### 当前已有
- `state.json.state`
- `state.json.gates.designApproved`
- `state.json.gates.redVerified`
- `validation.status`
- reviewer verdict JSON

### 本轮选定方向
- 不新增 `planApproved` 布尔 gate key
- `TASKED` 作为计划/任务已可消费的唯一状态
- `tasks.md` 在 `DESIGN_APPROVED` 前可以存在，但只能视为 draft
- `tasks.md` 从 draft 转为正式 plan 的最小判定：标题从 `# Draft Tasks (Pending Design Approval)` 变为 `# Tasks`，且 plan-critic verdict 不为 `block`
- `verify` 作为 reviewer verdict / validation freshness 的主要机械消费点
- `pre-write` 保持写入时高价值阻断职责，不承载全部 reviewer/state matrix
- `stop` 保持 freshness / 完成态保护，不承载 plan/task gate 语义
- `api-consistency-reviewer` 在 `impact.api=no` 时视为不适用，不要求缺席即 block

## Error Handling

本 change 主要处理治理错误路径：

- 缺 design artifact / design approval 就不能进入下一阶段
- draft tasks 不应声称 plan-ready / implementation-ready
- reviewer verdict 为 block 时，不应继续推进对应状态
- validation freshness 缺失时，不应完成关闭

## Transaction Boundaries

不适用。

## Testing Strategy

本轮后续实现至少应覆盖：

1. `verify` 对 design gate / reviewer matrix / validation freshness 的消费
2. hooks 对 state/gate 组合的阻断行为
3. reviewer verdict 为 `block` / `advisory` / `pass` 的路径差异
4. `tasks.md` draft/finalized 与 `TASKED` / `EXECUTING` 的关系

后续实现不能继续只用泛化的 `verify` 命令描述 RED/GREEN；需要引入 issue #11 范围内的最小 smoke harness 与 fixture，保证每个 task 有明确的失败断言与成功判据。

## Rollout and Rollback

- rollout：先在 governance/rules/runtime 层增量收紧 issue #11 范围内的 gate 语义
- rollback：若某条 gate 过早收紧导致主流程无法推进，可先回退对应 runtime 消费逻辑，但保留 spec 中的长期目标说明

## Risks

- 若把 plan/task gate 设计成过度复杂的数据模型，会让弱模型和人工维护成本都变高
- 若 reviewer verdict 直接硬消费但没有清楚区分 blocking/advisory，可能把正常变更意外卡死
- 若 design/plan/task 语义边界不清，后续 issue 会继续重复争论“哪个阶段该拦截”

## Open Questions

1. `tasks.md` 的 draft/finalized 标记未来是否需要 machine-readable schema，而不只是 header 约定？
2. `pre-write` 是否在后续第二阶段需要消费 `state >= TASKED`，还是继续只拦 design/red/high-value paths？
3. `api-consistency-reviewer` 的不适用情况，后续是否仍要求落一个显式 advisory/pass verdict 文件？

## Design Self-Review

- requirement coverage：已覆盖 issue #11 的三个核心问题（design / plan-task / verdict-validation）
- scope：保持在 governance gate 语义，不扩散到 Java sample 或 runtime productization 主线
- testability：后续实现可通过 hooks、verify、review verdict 文件和 change artifact 进行定向验证
- risk control：先明确语义，再补 runtime 消费，避免 schema 先膨胀

## Approval

本轮 design review 已给出 `pass`，因此当前 design 可进入 `DESIGN_APPROVED`。下一阶段应把 tasks 从 draft 收敛为正式 plan，并获取 `plan-critic` 的非 block verdict，然后再进入 `TASKED`。
