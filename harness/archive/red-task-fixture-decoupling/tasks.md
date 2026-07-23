# Tasks

Status: plan-approved

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer
- 本阶段交接物：`tasks.md`

- clarify-ready: true
- design-approved: advisory / non-blocking（`design-reviewer`，2026-07-22，关键建议已吸收进 design.md）
- plan-critic verdict: pass（2026-07-22，见 `reviews/plan-critic.json`）
- current active change: `red-task-fixture-decoupling`

---

### Task 1: 先写 guard smoke，确认真实 changeId 硬编码仍存在（RED）

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs`

**Consumes**
- `design.md` Testing Strategy：guard 运行时动态枚举 `harness/changes/` 下真实 changeId，检查 `gate-hardening-red-task-smoke.mjs` 源码不含这些字面量

**Produces**
- 一个新的 smoke 测试，流程：
  1. `const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))`
  2. `const realChangeIds = fs.readdirSync(path.join(repoRoot, 'harness', 'changes'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)`
  3. 读取 `gate-hardening-red-task-smoke.mjs` 源码文本
  4. 对 `realChangeIds` 逐一做 `text.includes(changeId)`，收集命中
  5. 采用与既有 smoke 一致的三态极性：`const ok = hits.length === 0`；`red` 模式下 `!ok` 必须 `fail()`，`green/verify` 模式下 `!ok` 也 `fail()`

**Implementation Order**
1. 先写 guard 测试文件本身
2. 在不修改被测文件前运行 `red` 模式，确认命中 `gate-hardening-semantics`（当前应 fail，形成可观察 RED）
3. 后续 Task 2 修复完 `gate-hardening-red-task-smoke.mjs` 后，再用这个 guard 的 `green`/`verify` 模式证明命中已清零

**Test-first Order**
1. `node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs red`
   - 预期：因为当前源码仍含 `gate-hardening-semantics`，脚本 fail（非 0）
2. `green/verify` 模式留待 Task 3 整体回归使用

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs <red|green|verify>`
- Why authoritative: 与仓库其余 smoke 测试统一的三态契约，直接对应本次要修的 bug（源码里硬编码真实 changeId）

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs red`
- Expected failure: fail，输出命中记录 `gate-hardening-red-task-smoke.mjs: gate-hardening-semantics`

**GREEN Evidence Point**
- 本 task 不产出 GREEN（见 Task 3）

**Refactor Boundary**
- 不适用（本 task 只新建 guard smoke）

**Acceptance Checks**
- [ ] guard smoke 文件已创建
- [ ] `red` 模式形成真实 RED（非 0）
- [ ] 不在 guard 源码里写死任何真实 changeId 字面量

**Review Target**
- Reviewer: 无独立 reviewer（Task 3 整体回归消费）
- Output: guard smoke 的 RED 输出

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动（不适用）
- [ ] 运行 GREEN 命令（不适用）
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 2: 修复 `gate-hardening-red-task-smoke.mjs` 的 fixture 构造

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs`

**Consumes**
- Task 1 的 guard RED
- `design.md` Flow / State Changes（清空 `harness/changes/`，注入 synthetic fixture，显式改写 `fixtureState.changeId`）
- `fixtures/red-task-missing-proof/state.json`

**Produces**
- `createTempRepo()` 之后立即新增：
  ```js
  fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });
  ```
- 删除当前硬编码真实 change 的三处耦合：
  - `activePath` 写入 `gate-hardening-semantics`
  - `statePath` 指向 `harness/changes/gate-hardening-semantics/state.json`
  - 直接把 fixture 写回真实 change state 文件
- 改为：
  1. 使用 synthetic changeId（固定为 `red-task-smoke-fixture`）
  2. `harness/ACTIVE_CHANGE` 写入该 synthetic id
  3. 复制 `fixtures/red-task-missing-proof/state.json` 到 `fixtureState`
  4. 在写入前执行 `fixtureState.changeId = 'red-task-smoke-fixture'`
  5. **显式重建目录**：`fs.mkdirSync(path.join(repoCopy, 'harness', 'changes', 'red-task-smoke-fixture'), { recursive: true })`
     （回应 plan-critic block：`writeJson()` 本身不会创建父目录，若缺这一步会在写 `state.json` 时 ENOENT）
  6. 将该 fixture 写入 `harness/changes/red-task-smoke-fixture/state.json`
  7. 其余 BLOCK / PASS 断言逻辑保持不变

**Implementation Order**
1. 先跑 Task 1 guard 的 `verify` 或继续使用其 RED 结果，确认当前仍命中 `gate-hardening-semantics`
2. 按 Produces 改写该测试文件
3. 重跑 guard 的 `green`/`verify`，确认命中清零
4. 重跑 `gate-hardening-red-task-smoke.mjs green`，确认原有 BLOCK / PASS 行为不变：
   - 第一次 `pre-write` 因缺 `currentTask-scoped red verification` 被 BLOCK
   - 第二次在 `redTask` / `redEvidenceRef` 对齐后放行

**Test-first Order**
1. guard smoke 对该文件的命中记录：修复前存在 → 修复后清零
2. `gate-hardening-red-task-smoke.mjs green`：修复后仍需通过

**Project-native Build/Test Command**
- Primary commands:
  - `node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs verify`
  - `node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green`
- Why authoritative: 前者证明硬编码真实 changeId 已消失，后者证明原有 pre-write BLOCK/PASS 语义未被破坏

**RED Evidence Point**
- Source: Task 1 的 guard `red` 已确认

**GREEN Evidence Point**
- Commands: 同上
- Expected success:
  - guard 0 命中
  - `gate-hardening-red-task-smoke.mjs` 仍输出 `Green gate-hardening red-task smoke passed.`

**Refactor Boundary**
- 仅允许整理变量命名/fixture 构造辅助函数；不允许弱化 BLOCK / PASS 断言

**Acceptance Checks**
- [ ] `harness/changes/` 在临时副本中被清空重建
- [ ] fixtureState.changeId 已显式改写为 synthetic id
- [ ] 原有 BLOCK/PASS 行为不变
- [ ] guard smoke 不再命中该文件

**Review Target**
- Reviewer: 无独立 reviewer（Task 3 整体回归消费）
- Output: guard green/verify 输出 + smoke green 输出

- [ ] 写失败测试（复用 Task 1 guard）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 3: 全量回归 + 归档 `gate-hardening-semantics`

**Files**
- Modify: 无新增源码；执行回归命令

**Consumes**
- Task 1-2 的 GREEN 结果

**Produces**
- 最终业务验收证据：
  1. `gate-hardening-red-task-fixture-guard-smoke.mjs green` 通过
  2. `gate-hardening-red-task-smoke.mjs green` 通过
  3. `node harness/plugin/runtime/cli.mjs verify` 通过
  4. `node harness/plugin/runtime/cli.mjs lifecycle archive gate-hardening-semantics` 成功执行
  5. 归档后 `harness/archive/gate-hardening-semantics/` 存在，`harness/changes/gate-hardening-semantics/` 不再存在

**Implementation Order**
1. 运行：
   ```bash
   node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs green
   node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green
   node harness/plugin/runtime/cli.mjs verify
   ```
2. 运行：
   ```bash
   node harness/plugin/runtime/cli.mjs lifecycle archive gate-hardening-semantics
   ```
   说明：`archive` 命令内部已经把 `isReferencedByTests(changeId)` 当作硬阻断；因此**命令成功本身就等价于
   “不再命中 test 源码里的真实 changeId 引用扫描”**，无需再单独实现一个额外的内部探针去检测 `isReferencedByTests`
3. 用 `ls` / `test -d` 确认：
   - `harness/archive/gate-hardening-semantics/` 存在
   - `harness/changes/gate-hardening-semantics/` 不存在
4. 更新 `harness/changes/red-task-fixture-decoupling/validation.md`

**Test-first Order**
不适用（本 task 是回归与业务验收）

**Project-native Build/Test Command**
- Primary commands: 见 Implementation Order 1-2
- Why authoritative: 这 4 条命令分别覆盖硬编码消除、功能回归、仓库总验证、以及本次 change 的最终业务验收（解除 archive 阻断）

**RED Evidence Point**
- 不适用（历史 RED 由 Task 1 guard 提供）

**GREEN Evidence Point**
- Commands: 同上
- Expected success: 全部命令 exit 0，且归档目录物理存在

**Refactor Boundary**
- 不适用

**Acceptance Checks**
- [ ] guard smoke 全绿
- [ ] red-task smoke 全绿
- [ ] `cli.mjs verify` 全绿
- [ ] `gate-hardening-semantics` 成功归档
- [ ] `validation.md` 已记录完整命令与结果

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `harness/changes/red-task-fixture-decoupling/reviews/verification-reviewer.json`

- [ ] 写失败测试（不适用）
- [ ] 运行 RED 命令（不适用）
- [ ] 实现最小 GREEN 改动（不适用）
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review
