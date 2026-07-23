# Design

## Role Ownership
- 主导角色：Principal Architect 视角
- 参与角色：Fullstack Developer / Quality Engineer / Human User
- 本阶段交接物：提供给开发与测试消费的 `design.md`

## Current-State Evidence

本项目自身治理面的变更（改 runtime hooks + state schema + 渲染函数），不涉及 Java 分层。

现状（探索证据）：
- 反馈面有 4 处：`session-start.mjs`、`cli.mjs status`（经 `status-summary.mjs`）、`pre-write.mjs`、`stop.mjs`
- workflow stage 与 gap 已可推断：`inferWorkflowStage()` / `inferCurrentGap()`（`lib/workflow.mjs`）
- `state.json` schema v2：含 `workflow.{stage,clarifyReady,userConfirmedScope,planReady,tddStatus}`、`gates`、`validation`、`decisions`、`blockers`
- **问题**：所有反馈都是"负向 BLOCK"或"一次性 session-start 摘要"。没有统一的、任何时刻可回显的 G4C 进度视图。用户被拦时看不到全局阶梯，不知道插件是否真在工作。

## Scope / Non-goals

### Scope
1. `state.json` schema 扩展：新增 `goal`（string）与 `successCriteria`（string[]），承载 G4C 的 Goal 维度
2. 新增纯函数 `renderG4CCard(root, changeId, data)`（`lib/g4c-card.mjs`）：把 stage 阶梯渲染成 ✓/▸/○ 三态可见进度
3. 三处回显同一张卡：`cli.mjs status`、`session-start.mjs`、`pre-write.mjs` 的 BLOCK 路径
4. Choice 机器化：`routingReason`（string）字段承载"为什么这个 tier"，卡片回显
5. 向后兼容：旧 state.json 缺 `goal`/`successCriteria`/`routingReason` 时，卡片降级显示"未记录"，不报错

### Non-goals
- 不改 BLOCK 的判定逻辑（只改 BLOCK 的**呈现**，附加 G4C 卡）
- 不做交互式 TUI，纯文本卡
- 不强制要求用户填 goal（缺失时降级，不 BLOCK）——避免又制造一个新断点
- 不改 `inferWorkflowStage` / `inferCurrentGap` 的既有推断逻辑

## Options Considered

- **Option A**：在每个 hook 里各写一段渲染逻辑
- **Option B（选定）**：抽一个纯函数 `renderG4CCard()`，三处复用同一张卡
- **Option C**：做成独立 CLI 子命令 `cli.mjs card`，其他地方引用

## Selected Option and Rationale

选 **Option B**。理由：
- 单一渲染源，杜绝三处漂移（本项目历史上多次踩"多处实现漂移"的坑）
- 纯函数易单测，输入 `(root, changeId, data)` → 输出字符串
- 三处（status / session-start / pre-write BLOCK）import 同一函数

## Rejected Options
- Option A：三处各写会漂移，违反本项目"单一真相源"原则
- Option C：多一个用户入口，违反"用户只感知 /harness"，且 BLOCK 路径无法内联调用子命令

## Affected Layers

纯 runtime 层（`harness/plugin/runtime/`）：
- `lib/g4c-card.mjs`（新增，纯函数）
- `hooks/session-start.mjs`（回显卡）
- `hooks/pre-write.mjs`（BLOCK 时回显卡）
- `lib/status-summary.mjs` 或 `cli.mjs status`（回显卡）
- `harness/templates/state.json`（新增字段占位）
- `lib/state-migration.mjs`（v2 内向后兼容补默认字段，无需 bump schemaVersion）

## Interface Contract

```
renderG4CCard(root: string, changeId: string, data: object): string
```
- 输入：projectRoot、changeId、已加载的 state.json 对象
- 输出：多行文本卡（Goal / Context / Choice / Progress 阶梯 / Correction）
- 无副作用，不读写文件以外的状态（可读 changeDir 判断 artifact 存在性）
- data 缺 goal/successCriteria/routingReason 时降级为"未记录"

### 阶梯三态定义
- `✓` 已完成：该 stage 的产出物存在且 gate 通过
- `▸` 当前：`inferWorkflowStage()` 返回的当前 stage
- `○` 未开始：当前 stage 之后的阶段

阶梯顺序固定：clarify → route → design → plan → tdd → verify → archive

## Data / SQL Design

无 DB。state.json schema 变化：
```jsonc
{
  "goal": "模板支持硬删除,级联清理关联数据",        // 新增，可选
  "successCriteria": ["删除后关联数据清空", "..."],  // 新增，可选
  "routingReason": "涉及 API + 数据变化，故 L2"       // 新增，可选
}
```
- Migration：`state-migration.mjs` 在 v2 内补 `goal:null / successCriteria:[] / routingReason:null`，不 bump schemaVersion（都是可选字段，缺失不影响校验）
- Rollback：字段可选，删除即回退，无数据迁移风险

## Architecture Boundary
- `g4c-card.mjs` 只依赖 `workflow.mjs`（stage 推断）+ `fs`（artifact 存在性），不反向依赖 hook
- 三个 hook 单向 import `renderG4CCard`
- Error handling：卡渲染失败必须 try/catch 吞掉，绝不能让渲染错误阻断 hook 主流程（BLOCK 仍要 BLOCK，session-start 仍要放行）

## Flow / State Changes

无 state machine 变化。仅在既有 stage 推断结果上叠加渲染。

## Testing Strategy
- Unit：`g4c-card-smoke.mjs`——多个 fixture state（各 stage、各 artifact 齐/缺、goal 有/无）→ 断言卡片包含正确的 ✓/▸/○ 与降级文案
- Integration：`pre-write-governed-target-smoke.mjs` 追加断言——BLOCK 时 stderr 含 G4C 卡关键标记
- RED path：先写 `g4c-card-smoke.mjs` 断言 `renderG4CCard` 存在且输出含阶梯三态 → 未实现时 import 失败/函数不存在 → RED

## Rollout and Rollback
- 纯增量，卡片是附加输出，不改判定
- Rollback：移除 import + 字段即可

## Risks
- 卡片渲染异常阻断 hook → 缓解：全部 try/catch 包裹，失败静默降级
- 卡片太长刷屏 → 缓解：紧凑格式，阶梯每行一格
- 与既有 session-start 输出重复 → 缓解：session-start 用卡片替代部分零散 `[Harness Workflow]` 行

## Open Questions
- 无（clarify 阶段已与用户确认卡片形态与字段）

## Design Self-Review
- Goal/Context/Choice/Checkpoint/Correction 五维是否都在卡上有落点？是 → Goal(goal+successCriteria) / Context(currentGap+已知证据) / Choice(routingReason) / Checkpoint(阶梯三态) / Correction(下一步+恢复入口)
- 是否新增了断点？否 → goal 缺失降级不 BLOCK
- 是否单一渲染源？是 → renderG4CCard 一处

## Approval
- 待 design-reviewer
