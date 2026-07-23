# Tasks

Status: plan-approved

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer
- 本阶段交接物：`tasks.md`

- clarify-ready: true
- design-approved: advisory（`design-reviewer`，2026-07-23，非阻断，关键建议已吸收进 design.md）
- plan-critic verdict: pass（待落盘）
- current active change: `state-schema-migration`

---

### Task 1: 写 RED 测试——旧格式 state.json 在新代码下报错

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs`

**Consumes**
- `design.md` Testing Strategy

**Produces**
- 一个 smoke 测试，流程：
  1. 在临时目录放入一个 version 1 的 state.json（无 `workflow.*`，无 `gates.redTask/redEvidenceRef`，但有 `gates.redVerified=true`）
  2. 调用 `loadActiveChange(tempRoot)`，断言返回的数据已迁移：`schemaVersion === 2`、`workflow` 完整、`gates.redVerified === false`（因为缺 redTask/redEvidenceRef 被重置）
  3. 调用 `validateArtifactStates(tempRoot)`，断言无错误
  4. 读取磁盘上的 state.json，断言已被持久化

**Test-first Order**
- 当前实现无迁移逻辑，`loadActiveChange` 不修改数据，`validateArtifactStates` 对部分缺失的 `workflow.*` 字段会报错 → RED

**Project-native Build/Test Command**
- `node harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs <red|green|verify>`

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs red`
- Expected failure: `validateArtifactStates` 报 `invalid workflow.stage` 或 `invalid workflow.clarifyReady` 等错误

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs green`
- Expected success: 迁移后数据完整，validateArtifactStates 无错误，磁盘已更新

**Acceptance Checks**
- [ ] version 1 state.json 缺 `workflow.*` 时，迁移后 `workflow` 对象完整
- [ ] version 1 state.json 有 `gates.redVerified=true` 但缺 `redTask/redEvidenceRef` 时，迁移后 `redVerified` 被重置为 `false`
- [ ] 迁移后 `validateArtifactStates` 无错误
- [ ] 磁盘上的 state.json 已被更新（schemaVersion === 2）

---

### Task 2: 实现 `state-migration.mjs` + 修改 `loadActiveChange` + 更新模板

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/state-migration.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/gates.mjs`（`loadActiveChange`）
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/state.json`（schemaVersion 升到 2）

**Consumes**
- Task 1 的 RED
- `design.md` Flow / State Changes

**Produces**
- `state-migration.mjs`：
  - 导出 `migrateStateV1ToV2(data): data`
  - 实现 `inferStageFromState`（映射全部 `allowedStates` 枚举值）
  - 补齐 `workflow.*` / `gates.redTask`/`redEvidenceRef`
  - 若 `gates.redVerified=true` 但缺字段：重置为 `false`
- `gates.mjs` 的 `loadActiveChange`：读取后调用 `migrateStateV1ToV2`，写回磁盘
- `templates/state.json`：`schemaVersion: 1` → `schemaVersion: 2`

**Implementation Order**
1. 先写 `state-migration.mjs`
2. 在 `loadActiveChange` 中集成迁移
3. 更新 `templates/state.json`
4. 重跑 Task 1 看 GREEN

**Acceptance Checks**
- [ ] `state-migration.mjs` 导出 `migrateStateV1ToV2`
- [ ] `loadActiveChange` 读取时自动迁移并写回
- [ ] `templates/state.json` schemaVersion === 2
- [ ] Task 1 GREEN

---

### Task 3: 全量回归

**Files**
- 无新增修改；执行回归命令

**Consumes**
- Task 1-2 的 GREEN

**Produces**
- 完整回归证据：
  1. Task 1 的 backward compat smoke GREEN
  2. 既有 `gates-governed-target-unit-smoke` GREEN（确认 gates.mjs 改动未破坏）
  3. 既有 `gate-hardening-design-gate-smoke` 等 5 个 smoke GREEN
  4. `node harness/plugin/runtime/cli.mjs verify` 全绿

**Acceptance Checks**
- [ ] 全部 smoke 通过
- [ ] verify 全绿
- [ ] `validation.md` 已记录完整命令与结果

---

### Task 4: 归档 + 发布 v0.1.12

**Files**
- 无代码修改
- Modify: `PROGRESS.md`（同步变更）
- Modify: `package.json` 版本号（由 release 脚本自动处理）

**Consumes**
- Task 3 的完整回归证据

**Produces**
- `state-schema-migration` 归档到 `harness/archive/`
- 版本 bump 到 0.1.12（patch）
- git tag + push
- GitHub Release 发布

**Acceptance Checks**
- [ ] `lifecycle archive state-schema-migration` 成功
- [ ] `PROGRESS.md` 已更新
- [ ] `npm run release` 成功
- [ ] GitHub Release 可见
