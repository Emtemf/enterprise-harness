# Tasks

Status: plan-approved

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer
- 本阶段交接物：`tasks.md`

- clarify-ready: true
- design-approved: true（`design-reviewer` pass，2026-07-22，三轮修正，见 `reviews/design-reviewer.json`）
- plan-critic verdict: pass（2026-07-22，一轮修正，见 `reviews/plan-critic.json`）
- current active change: `smoke-fixture-decoupling`

---

### Task 1: 新增 guard smoke（动态枚举版），先确认 RED

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs`
- Test: 该文件本身即测试（`red|green|verify` 三态约定）

**Consumes**
- `design.md` Testing Strategy："guard 不写死任何具体 changeId，运行时 `fs.readdirSync(harness/changes/)` 动态枚举，
  对 4 个目标文件 + guard 自身源码做子串检查"

**Produces**
- 一个新的 smoke 测试，逻辑：
  1. `const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))`
  2. `const realChangeIds = fs.readdirSync(path.join(repoRoot, 'harness', 'changes'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)`
  3. `const targetFiles = ['gate-hardening-design-gate-smoke.mjs', 'gate-hardening-task-state-smoke.mjs', 'gate-hardening-review-validation-smoke.mjs', 'gate-hardening-validation-digest-smoke.mjs', 'gate-hardening-fixture-guard-smoke.mjs']`
     （**含 guard 自己的文件名**，用 `import.meta.url` 解析自身路径，实现自检）
  4. 对每个 `targetFiles` 读取源码文本，对每个 `realChangeIds` 做 `text.includes(changeId)` 检查，收集命中记录
  5. `const ok = hits.length === 0`——**与仓库全部既有同类测试（`mandatory-gate-contract-smoke.mjs`、
     `gate-hardening-design-gate-smoke.mjs` 等）统一的三态判定极性**：`ok===true` 表示"无违规/已修复"，
     `ok===false` 表示"存在违规"。三态处理方式：
     ```js
     if (mode === 'red') {
       if (!ok) fail('Expected no hardcoded real changeId references, but found: ...' + hits.join(', '));
       pass('Red precondition no longer holds.');
     }
     if (!ok) fail('gate-hardening-fixture-guard-smoke failed: ' + hits.join(', '));
     pass(mode === 'green' ? 'Green gate-hardening-fixture-guard-smoke passed.' : 'gate-hardening-fixture-guard-smoke verify passed.');
     ```
     即：`red` 模式下，只要命中记录非空（`!ok`），脚本必须 `fail()`（非 0 退出）——这才是可观察的 RED 证据，
     与 design.md RED path 的 Expected failure 描述一致，也与 Task 2-5 的 RED Evidence Point（用 `verify`
     模式观察 `fail()`）极性一致

**Implementation Order**
1. 先写这个 guard 测试文件本身（本 task 就是"写测试"，没有更下层的被测生产代码——guard 本身既是测试也是本次
   change 的核心新增产物）
2. 运行 `red` 模式，**必须观察到 `fail()` 输出（非 0 退出码）**：命中记录非空（`gate-tightening-skeleton`
   在 4 个目标文件里都存在，`normalizedReviews` 涉及的 4 个真实 changeId 在
   `gate-hardening-review-validation-smoke.mjs` 里也存在），这就是本 task 的 RED 证据——观察到失败退出，
   而不是"观察到 pass"
3. 不需要额外"实现"步骤——guard 本身实现完成即视为该 task 完成；Task 2-5 逐一修复后重跑该 guard（`verify`
   模式）会看到命中记录逐步减少，最终 Task 6 时归零转绿

**Test-first Order**
1. `red` 模式：脚本必须以 `fail()`（非 0 退出）结束，因为此时命中记录非空（这是有效 RED，不是误判）
2. （`green`/`verify` 模式的全部命中归零通过条件见 Task 6，本 task 只负责建立 RED 基线）

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs <red|green|verify>`
- Why this command is authoritative for the target project: 仓库既定的 smoke 测试约定（同名 `-smoke.mjs` +
  `red/green/verify` 三态，且三态共用同一个 `ok` 判定），与其余 3 个待修复文件、以及上一轮
  `gate-tightening-skeleton` change 新增的测试保持一致

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs red`
- Expected failure: 脚本 `fail()` 退出（非 0），输出命中记录列表（当前应至少包含 4 个目标文件对
  `gate-tightening-skeleton` 的命中，以及 `gate-hardening-review-validation-smoke.mjs` 对另外 4 个真实
  changeId 的命中）——这与 design.md RED path 的极性完全一致

**GREEN Evidence Point**
- 本 task 不产出 GREEN（GREEN 需要等 Task 2-5 全部修复完才成立，见 Task 6）

**Refactor Boundary**
- 不适用（本 task 只新建文件，无需重构）

**Acceptance Checks**
- [ ] guard 测试文件已创建，`red` 模式确认命中当前 4 个目标文件的硬编码违规
- [ ] guard 自身文件名已列入 `targetFiles`（自检）

**Review Target**
- Reviewer: 无独立 reviewer（Task 6 整体回归 + `verification-reviewer` 消费）
- Output: guard smoke 的 `red` 输出

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动（不适用，本 task 无对应生产代码）
- [ ] 运行 GREEN 命令（不适用，见上）
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 2: 修复 `gate-hardening-design-gate-smoke.mjs`

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs`

**Consumes**
- Task 1 的 guard smoke（作为本 task 的 RED 证据来源之一）
- 该文件自身既有的 `green` 模式（作为回归基线）

**Produces**
- 在 `createTempRepo()` 之后、第一个 `createChange()` 之前，新增：
  ```js
  fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });
  ```
- 删除原有的 `skeletonStatePath` 特殊处理代码块（读取 `gate-tightening-skeleton` state.json、删除 `gates`、写回）

**Implementation Order**
1. 先确认 RED：运行 Task 1 的 guard smoke `verify` 模式，确认命中记录里包含
   `gate-hardening-design-gate-smoke.mjs`
2. 应用 Produces 描述的改动
3. 确认 GREEN：
   a. 重跑 guard smoke，确认命中记录里不再包含 `gate-hardening-design-gate-smoke.mjs`
   b. 重跑该文件自身的 `green` 模式，确认原有 3 条断言（`hasMissingReviewFailure`/`hasMissingApprovalFailure`/
      `hasBlockedReviewFailure`）仍然通过

**Test-first Order**
1. guard smoke 对该文件的命中记录：修复前存在 → 修复后消失
2. 该文件自身 `green` 模式：修复后仍需通过（回归）

**Project-native Build/Test Command**
- Primary command:
  - `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
  - `node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green`
- Why this command is authoritative for the target project: 同 Task 1

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
- Expected failure: 命中记录包含 `gate-hardening-design-gate-smoke.mjs: gate-tightening-skeleton`（修复前）

**GREEN Evidence Point**
- Command: 见 Implementation Order 步骤 3a/3b
- Expected success: guard 不再命中该文件；该文件自身 `green` 模式退出码 0

**Refactor Boundary**
- 全绿后仅允许调整代码风格（如变量命名），不改变逻辑

**Acceptance Checks**
- [ ] `harness/changes/` 在临时副本里被清空后重建，只含该文件自己注入的 3 个 fixture
- [ ] 原有 3 条断言逻辑未改变，`green` 模式通过
- [ ] guard smoke 不再命中此文件

**Review Target**
- Reviewer: 无独立 reviewer（Task 6 整体回归消费）
- Output: 上述两条命令的 GREEN 输出

- [ ] 写失败测试（复用 Task 1 的 guard，无需为本 task 单独新写）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 3: 修复 `gate-hardening-task-state-smoke.mjs`

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs`

**Consumes**
- Task 1 的 guard smoke
- 该文件自身既有的 `green` 模式

**Produces**
- 同 Task 2 的改动模式：`createTempRepo()` 后立即 `rmSync(harness/changes)`，删除 `skeletonStatePath` 特殊处理块

**Implementation Order**
1. 确认 RED：guard smoke `verify` 命中记录包含此文件
2. 应用改动
3. 确认 GREEN：guard 不再命中 + 该文件自身 `green` 模式通过（原有 2 条断言
   `hasDraftTaskFailure`/`hasCurrentTaskFailure`）

**Test-first Order**
1. guard smoke 命中记录：修复前存在 → 修复后消失
2. 该文件自身 `green` 模式：修复后仍需通过

**Project-native Build/Test Command**
- Primary command:
  - `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
  - `node harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green`

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
- Expected failure: 命中记录包含 `gate-hardening-task-state-smoke.mjs: gate-tightening-skeleton`

**GREEN Evidence Point**
- Expected success: guard 不再命中该文件；该文件自身 `green` 模式退出码 0

**Refactor Boundary**
- 全绿后仅允许调整代码风格

**Acceptance Checks**
- [ ] `harness/changes/` 清空重建，只含该文件自己注入的 2 个 fixture
  （`task-gate-draft-tasks`/`task-gate-missing-current-task`）
- [ ] 原有 2 条断言逻辑未改变，`green` 模式通过
- [ ] guard smoke 不再命中此文件

**Review Target**
- Reviewer: 无独立 reviewer（Task 6 整体回归消费）
- Output: 上述两条命令的 GREEN 输出

- [ ] 写失败测试（复用 Task 1 的 guard）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 4（高风险）: 修复 `gate-hardening-review-validation-smoke.mjs`

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs`

**Consumes**
- Task 1 的 guard smoke
- 该文件自身既有的 `green` 模式（5 条断言，回归风险最高）

**Produces**
- 同 Task 2 的改动模式：`createTempRepo()` 后立即 `rmSync(harness/changes)`，删除 `skeletonStatePath` 特殊处理块
- **额外**：删除 `normalizedReviews` 数组及其 `for...of` 循环（第 125-134 行，对
  `intake-smoke-demo`/`phase0-claude-governance-skeleton`/`plugin-runtime-skeleton`/
  `reference-service-boundary-realignment` 补写 reviewer verdict 的逻辑）——清空 `harness/changes/` 后
  这 4 个真实 change 已不存在于临时副本里，这段逻辑不再需要

**Implementation Order**
1. 确认 RED：guard smoke `verify` 命中记录包含此文件的 `gate-tightening-skeleton` **以及**
   `normalizedReviews` 涉及的 4 个真实 changeId（共 5 类命中，均来自这一个文件）
2. 应用改动（两处：`rmSync` + 删除 `skeletonStatePath` 块 + 删除 `normalizedReviews` 循环）
3. 确认 GREEN：
   a. guard 不再命中此文件（任何 changeId）
   b. **重点**：该文件自身 `green` 模式必须通过，逐条核对 5 条断言仍生效：
      - `hasReviewerFailure`（`review-validation-missing-api-review` 缺 `api-consistency-reviewer`）
      - `hasVerifyStaleFailure`（`review-validation-reviewed-stale` 的 `REVIEWED requires fresh validation`）
      - `hasStopReviewerBlock`（`stop.mjs` 对 `review-validation-missing-api-review` 的拦截）
      - `hasStopReviewedStaleBlock`（`stop.mjs` 对 `review-validation-reviewed-stale` 的拦截）
      - `hasStopValidatedStaleBlock`（`stop.mjs` 对 `review-validation-stale`——来自 fixture 文件
        `test/fixtures/review-validation-stale/state.json`——的拦截）
   c. **已知具体风险点（非"实现时再想"，已定位到确切成因）**：`stop.mjs:53` 用
      `fs.readdirSync(changesDir, { withFileTypes: true })` 遍历 `harness/changes/` 下**全部**目录，对每个
      目录的 BLOCK 条件（`stop.mjs:60-75`：缺 `validation.md` → `REVIEWED`/`VALIDATED` 但非 `fresh` →
      reviewer verdict 不满足）逐一检查，**命中第一个 BLOCK 条件就 `exit(2)`，不聚合、不继续遍历后续目录**。
      清空 `harness/changes/` 后，风险源从"其他真实 change"变成**这 3 个新注入 fixture 彼此之间的
      `readdirSync` 返回顺序**（`review-validation-stale`/`review-validation-reviewed-stale`/
      `review-validation-missing-api-review`，创建顺序见 Produces 描述的原始代码顺序）——`readdirSync` 的
      返回顺序不保证等于创建顺序或字母序，是本 task 实现时必须**实测确认**、而非假设的点：
      - 若三者同时存在时 `runStop` 命中的第一个 BLOCK 不是 `hasStopReviewerBlock` 预期的
        `review-validation-missing-api-review`，说明 `readdirSync` 返回顺序与原实现（未清空 `harness/changes/`
        时，其他真实 change 与这 3 个 fixture混排后恰好呈现的顺序）不同
      - 此时**不得**靠恢复 `normalizedReviews`/引入真实 change 来"凑顺序"，正确做法是：在 GREEN 阶段用
        `console.log(fs.readdirSync(changesDir).map(e=>e.name))` 实测当前顺序，若确认不稳定/不符合预期，
        回到 design 阶段评估是否需要让测试对 3 次 `runStop` 调用采用"改用聚合式校验"或"每次调用前只保留
        该次需要的单个目录"的方式重构断言逻辑（而不是依赖 `readdirSync` 隐式顺序）——这是需要真实 GREEN 阶段
        实测结果才能决定的具体分支，design.md Risks 已预判此类风险的处理原则（"补充等价合成 fixture 而非
        回退依赖真实 change"）

**Test-first Order**
1. guard smoke 命中记录：修复前存在 5 类命中 → 修复后 0 命中
2. 该文件自身 `green` 模式：5 条断言全部通过（修复后）

**Project-native Build/Test Command**
- Primary command:
  - `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
  - `node harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green`

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
- Expected failure: 命中记录包含 `gate-hardening-review-validation-smoke.mjs` 关联的 5 个 changeId
  （`gate-tightening-skeleton` + 4 个 `normalizedReviews` 涉及的真实 changeId）

**GREEN Evidence Point**
- Expected success: guard 对此文件 0 命中；该文件自身 `green` 模式退出码 0，且日志/stdout 里 5 条断言均可
  逐条追溯（必要时可在实现阶段临时加 `console.log` 打印每条布尔值辅助调试，调试完成后移除，不进入最终代码）

**Refactor Boundary**
- 全绿后仅允许调整代码风格；**不允许**为了让断言"更容易通过"而放宽任何一条断言的匹配条件

**Acceptance Checks**
- [ ] `harness/changes/` 清空重建，只含该文件自己注入的 3 个 fixture
  （`review-validation-stale` 来自 fixture 文件、`review-validation-reviewed-stale`、
  `review-validation-missing-api-review`）
- [ ] `normalizedReviews` 循环已完全删除，不残留死代码
- [ ] 5 条原有断言全部通过，逐条有真实命令输出可追溯（记入 validation.md）
- [ ] guard smoke 不再命中此文件

**Review Target**
- Reviewer: 无独立 reviewer（Task 6 整体回归消费，但本 task 的 GREEN 证据需要在 validation.md 里比其他
  task 更详细地记录 5 条断言各自的判定依据）
- Output: 上述两条命令的 GREEN 输出 + 5 条断言的逐条确认记录

- [ ] 写失败测试（复用 Task 1 的 guard）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 5: 修复 `gate-hardening-validation-digest-smoke.mjs`

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`

**Consumes**
- Task 1 的 guard smoke
- 该文件自身既有的 `green` 模式

**Produces**
- 同 Task 2 的改动模式：`createTempRepo()` 后立即 `rmSync(harness/changes)`，删除 `skeletonStatePath` 特殊处理块

**Implementation Order**
1. 确认 RED：guard smoke `verify` 命中记录包含此文件
2. 应用改动
3. 确认 GREEN：guard 不再命中 + 该文件自身 `green` 模式通过（原有 7 个布尔条件：`hasComputedDigest`/
   `hasPortableDigest`/`hasVerifyDigestFailure`/`hasPostWriteStale`/`hasNormalizedWindowsPath` 等组成的 `ok`）

**Test-first Order**
1. guard smoke 命中记录：修复前存在 → 修复后消失
2. 该文件自身 `green` 模式：修复后仍需通过

**Project-native Build/Test Command**
- Primary command:
  - `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
  - `node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green`

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs verify`
- Expected failure: 命中记录包含 `gate-hardening-validation-digest-smoke.mjs: gate-tightening-skeleton`

**GREEN Evidence Point**
- Expected success: guard 不再命中该文件；该文件自身 `green` 模式退出码 0

**Refactor Boundary**
- 全绿后仅允许调整代码风格

**Acceptance Checks**
- [ ] `harness/changes/` 清空重建，只含该文件自己注入的 fixture（`createChange(repoCopy)` 内部生成的
  单个 change）
- [ ] 原有断言逻辑未改变，`green` 模式通过
- [ ] guard smoke 不再命中此文件

**Review Target**
- Reviewer: 无独立 reviewer（Task 6 整体回归消费）
- Output: 上述两条命令的 GREEN 输出

- [ ] 写失败测试（复用 Task 1 的 guard）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 6: 全量回归 + 归档 `gate-tightening-skeleton`（最终业务验收）

**Files**
- Modify: 无新增源码；仅执行既有测试与本 change 新增的 guard smoke
- Test: Task 1-5 涉及的全部 5 个文件（4 个修复 + 1 个新增 guard）

**Consumes**
- Task 1-5 的全部 GREEN 结果

**Produces**
- 一份完整的回归证据，证明：
  1. guard smoke `green`/`verify` 模式：0 命中（4 个目标文件 + guard 自身均不含任何真实 changeId 字面量）
  2. 4 个被修复文件各自的 `green` 模式全部通过（Task 2-5 已分别确认，本 task 做最终一次性重跑复核）
  3. `node harness/plugin/runtime/cli.mjs verify` 结构/契约检查全绿（确认本次改动未影响仓库自身状态）
  4. `node harness/plugin/runtime/cli.mjs lifecycle archive gate-tightening-skeleton` 成功执行
     （**最终业务验收标准**：`isReferencedByTests` 不再拦截，`gate-tightening-skeleton` 从
     `harness/changes/` 移动到 `harness/archive/`）

**Implementation Order**
1. 依次运行：
   ```
   node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs green
   node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green
   node harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green
   node harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green
   node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green
   ```
2. 运行 `node harness/plugin/runtime/cli.mjs verify`
3. 运行 `node harness/plugin/runtime/cli.mjs lifecycle archive gate-tightening-skeleton`
4. 确认 `harness/archive/gate-tightening-skeleton/` 存在且 `harness/changes/gate-tightening-skeleton/` 不再存在
5. 更新 `harness/changes/smoke-fixture-decoupling/validation.md` 记录以上全部命令与结果

**Test-first Order**
不适用（本任务是回归验证，不新增测试用例）

**Project-native Build/Test Command**
- Primary command: 见 Implementation Order 1-3 列出的全部 7 条命令
- Why this command is authoritative for the target project: 归档命令本身就是本次 change 的最终业务验收标准，
  必须真实执行并观察到目录物理移动，而不是只看 exit code

**RED Evidence Point**
- 不适用（本任务不引入新失败测试，是 Task 1-5 完成后的整体确认）

**GREEN Evidence Point**
- Command: 见 Implementation Order 1-3
- Expected success: 全部命令 exit 0；`lifecycle archive` 命令输出确认归档成功；`harness/archive/gate-tightening-skeleton/`
  目录存在

**Refactor Boundary**
- 不适用

**Acceptance Checks**
- [ ] guard smoke 0 命中
- [ ] 4 个被修复文件全部 GREEN
- [ ] `cli.mjs verify` 全绿
- [ ] `gate-tightening-skeleton` 成功归档到 `harness/archive/`
- [ ] `validation.md` 已记录以上全部命令与结果

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `harness/changes/smoke-fixture-decoupling/reviews/verification-reviewer.json`

- [ ] 写失败测试（不适用，见上）
- [ ] 运行 RED 命令（不适用，见上）
- [ ] 实现最小 GREEN 改动（不适用，本任务不改代码）
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review
