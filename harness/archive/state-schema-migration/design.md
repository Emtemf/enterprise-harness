# Design

## Role Ownership
- 主导角色：Principal Architect 视角
- 参与角色：Fullstack Developer / Quality Engineer
- 本阶段交接物：`design.md`

## Current-State Evidence

见 `evidence/引入 state.json schema migration 机制，确保旧版本 state 不会破坏新版本代码的校验逻辑-exploration.md`。关键事实：

- `validateArtifactStates`（`checks.mjs:220-245`）：`if (data.workflow)` 为 falsy 时跳过全部 `workflow.*` 校验——旧 state.json 完全不含 `workflow` 时安全，但**部分迁移**（`workflow` 存在但 `stage`/`clarifyReady` 等缺失）时会报非法状态
- `hasCurrentTaskRedVerification`（`gates.mjs:39-49`）：依赖 `gates.redTask`/`redEvidenceRef`；旧 state.json 可能有 `gates.redVerified=true` 但缺这两个字段，导致 `currentTask` 检查失败，可能误触 BLOCK
- `state.json` 模板已有 `schemaVersion: 1`，但**没有任何代码消费它做迁移**
- `validateArtifactStates` 里对 `schemaVersion` 的校验是 `if (!(key in data)) errors.push(...)`，只要字段存在就不报错——所以把 version 从 1 升到 2 不会让旧 state.json 被拒绝
- `loadActiveChange`（`gates.mjs:4-15`）读取 state.json 后直接返回，不修改内容

## Scope / Non-goals

范围内：
- 新增 `state-migration.mjs` 模块，定义 `schemaVersion: 1` → `schemaVersion: 2` 的迁移规则
- 在 `loadActiveChange` 中调用迁移逻辑，读取时自动补字段并写回磁盘
- 更新 `templates/state.json` 为 schemaVersion 2（含 `workflow.*` 字段）
- 新增回归测试：旧格式 state.json（version 1，无 `workflow.*`、无 `gates.redTask/redEvidenceRef`）跑 verify 不报错

非目标：
- 不改 `workflow.mjs`/`lifecycle.mjs`/`validateArtifactStates` 的校验逻辑
- 不处理 `local-adapter.json` 的 migration
- 不处理非 Java 项目的兼容性

> **关于 `workflow.mjs` 中的 `ensureWorkflowShape`（回应 design review F2）**：
> `workflow.mjs:89-100` 定义了 `ensureWorkflowShape`，其逻辑与 `state-migration.mjs` 迁移规则高度重叠。
> 本轮不改 `workflow.mjs` 的原因：`ensureWorkflowShape` 被 `workflow.mjs` 自己的 `loadChange` 函数调用
> （不经过 `loadActiveChange`），是独立的代码路径；两个路径并存不会导致正确性问题——`loadActiveChange`
> 读取时写回磁盘，`workflow.mjs loadChange` 在运行时补齐。如果未来要统一，应作为独立 change 消除双实现，
> 而不是混入本次 migration change。这属于已知技术债，记录在 PROGRESS.md 中。

## Options Considered

### Option A：读取时自动迁移（在 `loadActiveChange` 里做）
最干净——读一次就升级，后续所有代码消费的都是最新格式。写回磁盘保证持久化。

### Option B：校验时容忍缺失
不修改磁盘文件，但每次 `validateArtifactStates` 都要重复判断旧格式字段缺失，增加认知负担。

### Option C：独立迁移命令
最保守但依赖人工操作，容易忘记。

## Selected Option and Rationale

选择 **Option A**（用户已确认）。

理由：
- 符合"harness 状态应该自愈"的哲学——不需要维护者记得跑迁移
- 读取时迁移 + 写回磁盘 = 一次性操作，后续所有消费方自然拿到最新格式
- `validateArtifactStates` 的校验逻辑不需要改动，减少风险面

## Rejected Options

- Option B 增加每次校验的认知负担，且不能保证所有路径都走校验
- Option C 依赖人工操作，容易遗漏

## Affected Layers

- runtime layer：`harness/plugin/runtime/lib/checks.mjs`、`harness/plugin/runtime/lib/gates.mjs`、新增 `harness/plugin/runtime/lib/state-migration.mjs`
- template layer：`harness/templates/state.json`（schemaVersion 升到 2）
- test layer：新增回归测试

## Interface Contract
- External API: 不适用
- Internal contract：
  - `state-migration.mjs` 导出 `migrateStateV1ToV2(data): data`（输入 state 对象，输出迁移后的对象，原地修改并返回）
  - `loadActiveChange` 返回的数据保证已迁移至最新 schema
- Compatibility / caller impact: 所有消费 `loadActiveChange` 的代码无需改动

## Data / SQL Design
- `state.json` 的 schemaVersion 从 1 升到 2
- version 2 比 version 1 新增：`workflow` 对象（含 `stage`/`clarifyReady`/`userConfirmedScope`/`planReady`/`tddStatus`/`nextEntry`），以及 `gates.redTask`/`gates.redEvidenceRef`（已有，但旧版本可能缺失）
- 迁移逻辑在读取时执行，写回磁盘后持久化

## Messaging / Event / MQ Design
不适用。

## Architecture Boundary
不适用。

## Flow / State Changes

迁移逻辑在 `loadActiveChange`（`gates.mjs:4-15`）中新增一步：

```
读取 state.json → 检查 schemaVersion → 若 < 2 则执行迁移 → 写回 state.json → 返回迁移后数据
```

迁移规则（version 1 → 2）：
1. `data.schemaVersion = 2`
2. 若 `data.workflow` 不存在或为 `null`/`undefined`：
   ```js
   data.workflow = {
     stage: inferStageFromState(data.state),  // 根据 state 推断合理默认值
     clarifyReady: true,
     userConfirmedScope: true,
     planReady: true,
     tddStatus: 'not-started',
     nextEntry: '/harness'
   }
   ```
3. 若 `data.gates` 存在且 `data.gates.redVerified === true` 但缺少 `redTask` 或 `redEvidenceRef`：
   同时将 `redVerified` 重置为 `false`，并补齐 `redTask = null` / `redEvidenceRef = null`
   （回应 design review F1：旧 state.json 记录了 `redVerified=true` 但丢失了关联字段时，
   无法确定之前的真实 `currentTask` 是什么。如果仅把 `redTask`/`redEvidenceRef` 补为 `null`，
   `validateArtifactStates` 里的 `data.gates.redTask !== data.currentTask` 和
   `typeof data.gates.redEvidenceRef !== 'string'` 会报错；同时将 `redVerified` 重置为 `false`
   是更安全、语义更清晰的选择——相当于"重新验证"，由用户后续重新标记）
4. 若 `data.gates` 存在且 `data.gates.redVerified` 为 `false`/不存在：补齐 `redTask = null`/`redEvidenceRef = null`（无害）
5. 写回 `statePath`（持久化）

`inferStageFromState` 的映射：
- `DRAFT`/`DISCOVERED` → `'clarify'`
- `CHANGE_APPROVED` → `'route'`
- `SPECIFIED`/`DESIGN_APPROVED` → `'design'`
- `TASKED` → `'plan'`
- `EXECUTING` → `'tdd'`
- `REVIEWED`/`VALIDATED` → `'verify'`
- `ARCHIVED` → `'archive'`
- 其他 → `'verify'`（保守默认）

## Cross-layer Type and Mapper Matrix
不适用。

## Repository Port Design
不适用。

## API Contract
不适用。

## Error Handling
- 迁移函数对输入做防御性检查：`data` 不是对象时直接返回，不抛异常
- 写回磁盘失败时（权限/磁盘满等极端场景），打印 warning 但不阻断读取——迁移后的数据在内存中仍然可用，只是下次读取会重试
- **双写时序安全性（回应 design review F4）**：`post-write.mjs:24-31` 会在读取 `loadActiveChange` 返回值后自行写回 state.json（设置 `validation.status = 'stale'`）。因为迁移在 `loadActiveChange` 内部已完成并写回磁盘，`post-write.mjs` 读到的已经是迁移后的数据，其写回（设置 stale）是基于已迁移数据的增量修改，不会覆盖迁移结果。Claude Code hooks 串行执行，不存在并发写入竞争

## Transaction Boundaries
不适用（文件系统单次写入，不需要事务）。

## Testing Strategy
- 新增回归测试 `state-migration-backward-compat-smoke.mjs`：
  1. 创建临时目录，放入一个 version 1 的 state.json（无 `workflow.*`，无 `gates.redTask/redEvidenceRef`）
  2. 运行 `loadActiveChange`（通过 `gates.mjs` 导入）
  3. 断言返回的数据 `schemaVersion === 2`，`workflow` 对象完整，`gates.redTask/redEvidenceRef` 存在
  4. 断言磁盘上的 state.json 已被更新
  5. 对迁移后的 state 跑 `validateArtifactStates`，断言无错误
  6. 对迁移后有 `gates.redVerified=true` 的 state 跑 `hasCurrentTaskRedVerification`，确认不再误触 BLOCK
- GREEN: 迁移后 state 通过全部校验
- 不改 `validateArtifactStates`/`hasCurrentTaskRedVerification` 本身——迁移在读取时已完成，校验侧无需变化

## Rollout and Rollback
- 新增 `state-migration.mjs` 模块 + `loadActiveChange` 加一行调用 + `templates/state.json` 版本号更新
- 回滚：还原 `gates.mjs`/`state-migration.mjs`/`templates/state.json`；已被迁移的 state.json 手动改回 version 1（schemaVersion 字段本身不影响校验，改回去无副作用）

## Risks
- `loadActiveChange` 每次调用都要写回磁盘，如果同时有多个 hook/命令并发读同一个 state.json，可能有写入竞争（但当前架构下 `loadActiveChange` 只在 `pre-write`/`post-write`/`stop` 等同步钩子里调用，不存在并发）
- 迁移后 `schemaVersion` 升到 2，如果未来出现 version 3 需要再次迁移，需要确保迁移链路可扩展

## Open Questions
- `inferStageFromState` 的映射是否需要覆盖所有 state 枚举值？（当前覆盖了 `DRAFT`/`DISCOVERED`/`CHANGE_APPROVED`/`SPECIFIED`/`DESIGN_APPROVED`/`TASKED`/`EXECUTING`/`REVIEWED`/`VALIDATED`/`ARCHIVED`，兜底为 `'verify'`）

## Design Self-Review
- 覆盖 clarify 决策：✅（读取时迁移 + schemaVersion 升到 2）
- 向后兼容：✅（旧 state.json 被读取时自动升级，`validateArtifactStates` 无需改动）
- 范围克制：✅（不改校验逻辑本身，只在加载层做迁移）

## Approval
待 `design-reviewer` 消费。
