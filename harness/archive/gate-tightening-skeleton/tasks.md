# Tasks

Status: plan-approved

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer
- 本阶段交接物：开发详细设计 / 代码级执行切片 `tasks.md`

- clarify-ready: true
- design-approved: true（`design-reviewer` pass，2026-07-22，见 `reviews/design-reviewer.json`）
- plan-critic verdict: pass（2026-07-22，见 `reviews/plan-critic.json`）
- current active change: `gate-tightening-skeleton`

---

### Task 1: 重写 `gates.mjs` 的路径探测算法为纯函数，先落单元测试

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/gates.mjs`
- Test: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs`（新建）

**Consumes**
- `design.md` Flow / State Changes 第 1-5 步（路径片段子序列匹配 + 祖先段黑名单算法）

**Produces**
- `gates.mjs` 内部新增 `detectGovernedKind(root, target)`（不导出，供 `isGovernedTarget`/`requiredGateForTarget` 共用）
- `isGovernedTarget(root, target)` 与 `requiredGateForTarget(root, target)` 外部签名不变，内部改为调用 `detectGovernedKind`
- 移除硬编码的 `reference-service/{src/main,src/test,openapi}` 绝对路径列表

**Implementation Order**
1. 先写测试文件 `gates-governed-target-unit-smoke.mjs`（直接 `import` `gates.mjs` 的导出函数，无需 spawn 子进程）
2. 在当前硬编码实现下运行测试，确认非 `reference-service` 命名路径的用例 RED（失败）
3. 实现 `detectGovernedKind`：
   - `path.relative(root, target)` → `..` 前缀直接返回 `null`
   - 按 `path.sep` 切分为 `segments`
   - 依次查找 `['src','main','java']` → `['src','test','java']` → 单段 `'openapi'`，取最靠左命中
   - 对匹配位置之前的祖先段（`segments.slice(0, matchIndex)`）做黑名单检查（`target`/`build`/`node_modules`/`.git`/`dist`/`out`），命中则返回 `null`
   - 未命中黑名单则返回 `{ kind, dir }`
4. 重写 `isGovernedTarget`/`requiredGateForTarget` 调用 `detectGovernedKind`，保持原有返回值语义（`isGovernedTarget` 返回目录字符串或 `null`；`requiredGateForTarget` 返回 `{needsDesignApproved, needsRedVerified}` 或 `null`）
5. 重跑测试，确认全部 GREEN
6. 全绿后允许的重构：抽取 `BLOCKLIST` 常量、`GOVERNED_PATTERNS` 常量到文件顶部，不改变行为

**Test-first Order**
1. `reference-service/src/main/java/...` → 命中 `main`（向后兼容基线）
2. `reference-service/src/test/java/...` → 命中 `test`
3. `reference-service/openapi/order-service.yaml` → 命中 `openapi`
4. `foo-service/src/main/java/...`（任意非 reference-service 模块名）→ 命中 `main`（**这是本次修复的核心回归点**）
5. `order-service/target/generated-sources/annotations/src/main/java/Foo.java` → 返回 `null`（黑名单祖先段排除）
6. `src/main/java/com/acme/target/service/Foo.java` → 命中 `main`（黑名单词出现在匹配段之后的包名里，不应被排除——锁定 design review 复审 advisory 的修正）
7. `README.md`、`docs/foo.md` 等完全不匹配路径 → 返回 `null`
8. `requiredGateForTarget` 对应上述每种 `kind` 返回正确的 `needsDesignApproved`/`needsRedVerified` 组合

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs <red|green|verify>`
- Why this command is authoritative for the target project: 本 change 修改的是 harness 自身 runtime（Node.js 脚本），非 Java 业务代码，不涉及 Maven/Gradle；仓库既有同类 runtime 修复（如 `hook-audit.mjs`、`plugin-cache.mjs`）均采用「新建同名 `-smoke.mjs` 测试文件 + `red/green/verify` 三态」的既定测试约定，本任务沿用该约定保持一致性

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs red`
- Expected failure: 在未修改 `gates.mjs` 前，Test-first Order 第 4/6 项（非 reference-service 模块名、包名含黑名单词）断言失败，测试脚本以非 0 退出并打印具体失败用例

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs green`
- Expected success: 全部 8 组 Test-first Order 用例断言通过，退出码 0

**Refactor Boundary**
- 仅在全绿后允许：抽取常量、补充注释说明算法决策；不允许在此阶段改变匹配逻辑本身

**Acceptance Checks**
- [ ] `reference-service` 向后兼容用例通过
- [ ] 非 `reference-service` 模块名的 `src/main/java` 用例通过（核心修复验证）
- [ ] 黑名单祖先段排除用例通过
- [ ] 黑名单词出现在包名中不被误排除的用例通过
- [ ] `requiredGateForTarget` 各 `kind` 对应的 gate 组合断言通过

**Review Target**
- Reviewer: 无独立 reviewer（本任务产出由 Task 5 的整体回归 + `plan-critic`/`verification-reviewer` 消费）
- Output: `gates-governed-target-unit-smoke.mjs` GREEN 输出

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 2: `checks.mjs` 新增 `hasChangeTracking` 导出

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Test: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/checks-change-tracking-unit-smoke.mjs`（新建）

**Consumes**
- `design.md` Interface Contract："新增 `checks.mjs` 导出函数 `hasChangeTracking(root): boolean`，仅检查 `harness/changes` 是否存在（不要求 `harness/specs`）"

**Produces**
- `checks.mjs` 新增导出 `export function hasChangeTracking(root) { return fs.existsSync(path.join(root, 'harness', 'changes')); }`

**Implementation Order**
1. 先写测试：有 `harness/changes` 目录 → `true`；无 → `false`；`harness/changes` 存在但 `harness/specs` 不存在 → 仍为 `true`（这是与 `isHarnessManaged` 的关键区别，必须显式断言）
2. 确认 RED（当前函数不存在，`import` 会报错/断言失败）
3. 实现 `hasChangeTracking`
4. 确认 GREEN

**Test-first Order**
1. 临时目录只有 `harness/changes/` → `true`
2. 临时目录同时有 `harness/changes/` 和 `harness/specs/` → `true`（与 `isHarnessManaged` 行为一致的重叠场景）
3. 临时目录完全没有 `harness/` → `false`
4. 临时目录有 `harness/specs/` 但没有 `harness/changes/` → `false`

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/checks-change-tracking-unit-smoke.mjs <red|green|verify>`
- Why this command is authoritative for the target project: 同 Task 1，纯 Node.js runtime 单测约定

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/checks-change-tracking-unit-smoke.mjs red`
- Expected failure: `hasChangeTracking` 未导出，`import` 报 `SyntaxError`/`undefined is not a function` 或等价断言失败

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/checks-change-tracking-unit-smoke.mjs green`
- Expected success: 4 组用例全部断言通过

**Refactor Boundary**
- 全绿后仅允许调整函数位置/注释，不改变判定条件

**Acceptance Checks**
- [ ] `harness/changes` 存在即为 `true`，不要求 `harness/specs`
- [ ] 与 `isHarnessManaged` 的行为差异被显式测试锁定

**Review Target**
- Reviewer: 无独立 reviewer（Task 5 整体回归消费）
- Output: `checks-change-tracking-unit-smoke.mjs` GREEN 输出

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 3: `pre-write.mjs` 集成——真实 spawn 子进程验证 BLOCK / PASS / REMINDER 三种场景

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/pre-write.mjs`
- Test: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs`（新建，参考 `gate-hardening-design-gate-smoke.mjs` 的 `fs.mkdtempSync` + `spawnSync` + `finally` 清理模式）

**Consumes**
- Task 1 产出的 `gates.mjs`（`isGovernedTarget`/`requiredGateForTarget` 已支持任意路径探测）
- `design.md` Architecture Boundary："新增的'.java 文件探测失败'提醒用 `console.error` + 不 `exit(2)`"

**Produces**
- `pre-write.mjs` 保持现有 BLOCK 逻辑不变（仍调用 `isGovernedTarget`/`requiredGateForTarget`，因其签名不变）
- 新增分支：`target.endsWith('.java')` 且 `isGovernedTarget(root, target)` 为 `null` 时，`console.error('REMINDER: ...')`，不影响退出码

**Implementation Order**
1. 先写测试文件：`fs.mkdtempSync` 创建临时目录模拟**不叫 `reference-service`** 的目标项目
2. 场景 A（BLOCK）：临时项目里 `order-service/src/main/java/Foo.java`，`harness/ACTIVE_CHANGE` 指向一个 `state.json` 中 `gates.designApproved=false` 的 change → `spawnSync('node', [preWritePath], {cwd: tmp, input: JSON.stringify({tool_input:{file_path: '.../Foo.java'}})})` → 断言 `status===2` 且 stderr 含 `BLOCK`
3. 场景 B（PASS）：同上但 `gates.designApproved=true` 且 `gates.redVerified=true`/`redTask`/`redEvidenceRef` 均匹配当前 `currentTask` → 断言 `status===0`
4. 场景 C（REMINDER）：临时项目里 `scripts/Migrate.java`（不在任何 `src/main/java`/`src/test/java` 约定下）→ 断言 `status===0` 且 stderr 含 `REMINDER`，不含 `BLOCK`
5. 确认三个场景在当前实现下的 RED 表现：场景 A 在改动前**不会**触发 BLOCK（因为 `order-service` 不是 `reference-service`，这正是本次要修的 bug），场景 C 目前完全没有提醒分支
6. 实现 Produces 中的改动
7. 重跑，确认三场景 GREEN

**Test-first Order**
1. 场景 A：非 reference-service 命名的 `src/main/java` 路径，`designApproved=false` → 必须 BLOCK（核心回归，验证"机械门禁对真实目标项目生效"）
2. 场景 B：同路径，gate 条件已满足 → 必须放行
3. 场景 C：`.java` 文件在无法识别的目录 → 提醒但不拦截
4. 场景 D（向后兼容）：临时项目内复刻 `reference-service/src/main/java/...` 结构，`designApproved=false` → 仍必须 BLOCK（确认修改后原有保护未失效）

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs <red|green|verify>`
- Why this command is authoritative for the target project: 需要真实触发 hook 子进程（`spawnSync` 调用 `pre-write.mjs` 并检查其 stdin/stdout/exit code 契约），而不是断言 `SKILL.md` 文本内容——这是本次 change 明确要修正的"虚假测试"问题（对照反例：`mandatory-gate-contract-smoke.mjs` 只做字符串匹配）

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs red`
- Expected failure: 场景 A 断言 `status===2` 失败（当前实现下 `order-service/...` 不会被识别为受治理路径，hook 直接 `exit(0)` 放行）

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs green`
- Expected success: 场景 A/B/C/D 全部按预期断言通过

**Refactor Boundary**
- 全绿后仅允许整理测试 fixture 构造函数，不改变 hook 行为

**Acceptance Checks**
- [ ] 非 reference-service 命名路径下 BLOCK 生效（核心验收点）
- [ ] gate 条件满足时正常放行
- [ ] `.java` 文件探测失败时只提醒不拦截
- [ ] `reference-service` 向后兼容未被破坏
- [ ] 测试结束清理临时目录，不污染仓库自身 `harness/ACTIVE_CHANGE`（参考 CHANGELOG 0.1.10 "smoke 污染修复"教训）

**Review Target**
- Reviewer: 无独立 reviewer（Task 5 整体回归 + `verification-reviewer` 消费）
- Output: `pre-write-governed-target-smoke.mjs` GREEN 输出

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 4: `post-write.mjs` 门控拆分——真实 spawn 子进程验证 `hasChangeTracking` 场景

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/post-write.mjs`
- Test: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/post-write-change-tracking-smoke.mjs`（新建，同样用 `spawnSync` + `mkdtempSync`）

**Consumes**
- Task 2 产出的 `checks.mjs` 的 `hasChangeTracking`
- `design.md` Flow / State Changes："`post-write.mjs` 门控拆分"一节

**Produces**
- `post-write.mjs` 移除顶部的整体 `if (!isHarnessManaged(root)) process.exit(0)` 早退
- 改为：
  - stdin 读取 + "标记 active change validation 为 stale"逻辑：只要求 `loadActiveChange(root).ok`（不再要求 `isHarnessManaged`）
  - `validateStructure(...)`：继续要求 `isHarnessManaged(root)` 才执行
  - `validateArtifactStates/validateReviewVerdicts/validateChangeEvidence`：改为要求 `hasChangeTracking(root)` 才执行
  - `validateOpenApiLight/validateControllerConsistency`：保持无条件执行（不变）

**Implementation Order**
1. 先写测试：临时项目只有 `harness/changes/<id>/`（无 `harness/specs/`），其中 `<id>/` 缺少 `validation.md`
2. 确认 RED：当前实现下 `isHarnessManaged=false` → 整体 `exit(0)`，不会报出 `missing validation.md`
3. 按 Produces 描述重构 `post-write.mjs`
4. 确认 GREEN：同样的临时项目现在能正确报出 `missing validation.md` 等 `validateChangeEvidence` 错误
5. 补充第二个场景：完全没有 `harness/` 目录（既非 harness-managed 也无 change tracking）→ 确认仍然安全无报错退出 0（防止本次改动过度收紧、误伤完全没用 harness 的项目）
6. 补充第三个场景：`isHarnessManaged=true`（有 `harness/changes` 和 `harness/specs`，但缺失 `requiredPaths()` 里的某个必需文件，如 `AGENTS.md`）→ 确认 `validateStructure` 仍正常执行并报出该文件缺失（回归本仓库自身场景，具体断言见 Test-first Order 第 3 项）

**Test-first Order**
1. `harness/changes/` 存在、`harness/specs/` 不存在、change 缺 `validation.md` → 报错（核心修复点）
2. 完全没有 `harness/` → 安全 no-op，退出 0
3. `harness/changes/` 与 `harness/specs/` 都存在，但故意让临时项目缺失 `requiredPaths()`（`checks.mjs`）里要求的某个文件（如不创建 `AGENTS.md`）→ 断言 stdout/stderr 包含该缺失文件对应的 `validateStructure` 报错（如 `file:AGENTS.md`），用于坐实"`isHarnessManaged=true` 时 `validateStructure` 确实被执行"，而不是只断言退出码

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/post-write-change-tracking-smoke.mjs <red|green|verify>`
- Why this command is authoritative for the target project: 同 Task 3，需要真实 spawn `post-write.mjs` 验证其对 stdin 输入的实际处理结果

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/post-write-change-tracking-smoke.mjs red`
- Expected failure: 场景 1 断言"输出包含 missing validation.md"失败（当前实现下整体 no-op，无任何输出）

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/post-write-change-tracking-smoke.mjs green`
- Expected success: 场景 1/2/3 全部按预期断言通过

**Refactor Boundary**
- 全绿后仅允许整理条件分支的代码结构，不改变门控条件本身

**Acceptance Checks**
- [ ] 有 `harness/changes` 无 `harness/specs` 的目标项目也能触发 artifact/evidence 校验（核心验收点）
- [ ] 完全无 `harness/` 的项目仍安全 no-op
- [ ] 本仓库自身（`isHarnessManaged=true`）场景下 `validateStructure` 未被误关闭

**Review Target**
- Reviewer: 无独立 reviewer（Task 5 整体回归 + `verification-reviewer` 消费）
- Output: `post-write-change-tracking-smoke.mjs` GREEN 输出

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 5: 回归——向后兼容 + 直接受影响的既有 smoke + 结构/契约检查

**Files**
- Modify: 无新增源码；仅执行既有测试与本 change 新增的 4 个测试文件
- Test: 本 change 修改的 4 个文件（`gates.mjs`/`checks.mjs`/`pre-write.mjs`/`post-write.mjs`）各自已有的 spawn 调用方（经 plan-critic 复审逐一核实源码后确认，共 4 个既有测试真实 spawn 到这些文件，而不是 `mandatory-gate-contract-smoke.mjs` 那种字符串匹配）：
  - `harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs`（spawn `cli.mjs verify`，且直接读取/清理 `gate-tightening-skeleton/state.json` 的 `gates` 字段，需确认该 smoke 对 `gate-tightening-skeleton/state.json` 的读取/清理逻辑不受本次运行时代码改动影响——本 change 只改 `gates.mjs`/`checks.mjs`/`pre-write.mjs`/`post-write.mjs` 四个运行时源码文件，不修改任何 change 的 `state.json` schema）
  - `harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs`（spawn `pre-write.mjs`，对真实 `reference-service/src/main/java` 路径做回归，是向后兼容的关键证据）
  - `harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`（spawn `post-write.mjs`，直接命中 Task 4 改的 stale 标记逻辑）
  - `harness/plugin/runtime/test/plugin-native-hooks-smoke.mjs`（在裸 non-harness-managed 项目上同时 spawn `pre-write.mjs`/`post-write.mjs`，正是 Task 4 拆分 `hasChangeTracking` 的边界场景）
  - `harness/plugin/runtime/test/non-harness-entry-smoke.mjs`（同类裸项目场景 spawn `post-write.mjs`）

**Consumes**
- Task 1-4 的全部 GREEN 结果

**Produces**
- 一份完整的回归证据，证明：
  1. 本仓库自身 `reference-service` 路径的既有保护未被破坏
  2. 新增 4 个测试文件全部 GREEN
  3. 上述 5 个直接 spawn 到本次改动文件的既有 smoke 全部仍为 GREEN
  4. `node harness/plugin/runtime/cli.mjs verify`（结构/契约检查——**不是**全量 smoke，`verify.mjs` 只跑 `checks.mjs` 里的 `validate*` 函数，不会 spawn 任何 `test/*.mjs`；仓库当前没有聚合运行全部 smoke 的脚本或 CI step，第 3 点的 5 个 smoke 必须逐一单独运行）全绿

**Implementation Order**
1. 依次运行 Task 1-4 新增的 4 个测试文件（`green` 模式）
2. 逐一运行以下 5 个既有 smoke（`green` 模式），确认均未被本次改动破坏：
   ```
   node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green
   node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green
   node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green
   node harness/plugin/runtime/test/plugin-native-hooks-smoke.mjs green
   node harness/plugin/runtime/test/non-harness-entry-smoke.mjs green
   ```
3. 运行 `node harness/plugin/runtime/cli.mjs verify`（结构/契约检查，非全量 smoke，见 Produces 第 4 点的澄清）
4. 更新 `harness/changes/gate-tightening-skeleton/validation.md` 记录以上全部命令与结果，并显式注明"本仓库当前无聚合 smoke runner，以上 9 条命令均为逐一单独执行"，避免验证阶段被误读为已跑过某个不存在的全量入口

**Test-first Order**
不适用（本任务是回归验证，不新增测试用例）

**Project-native Build/Test Command**
- Primary command: 见 Implementation Order 1-3 列出的全部 9 条命令（4 个新增 + 5 个既有 smoke + 1 个 `cli.mjs verify`）
- Why this command is authoritative for the target project: 本仓库当前没有聚合运行全部 smoke 的脚本或 CI step（已核实 `platform-smoke.yml`/`release.yml`/`prepublish.mjs`/根 `package.json` 均无此类聚合入口），因此必须逐一执行上述命令才能构成完整回归证据；`cli.mjs verify` 仅是结构/契约检查，不能单独作为"全量验证通过"的证据

**RED Evidence Point**
- 不适用（本任务不引入新失败测试，是 Task 1-4 完成后的整体确认）

**GREEN Evidence Point**
- Command: 见 Implementation Order 1-3 的全部 9 条命令
- Expected success: 全部命令 exit 0，无遗留失败/报错

**Refactor Boundary**
- 不适用

**Acceptance Checks**
- [ ] 4 个新增测试文件全部 GREEN
- [ ] `gate-hardening-design-gate-smoke.mjs` 未被破坏（含其对 `gate-tightening-skeleton/state.json` 新增字段的兼容性）
- [ ] `gate-hardening-red-task-smoke.mjs` 未被破坏（`reference-service` 向后兼容关键证据）
- [ ] `gate-hardening-validation-digest-smoke.mjs` 未被破坏
- [ ] `plugin-native-hooks-smoke.mjs` 未被破坏
- [ ] `non-harness-entry-smoke.mjs` 未被破坏
- [ ] `cli.mjs verify` 全绿
- [ ] `validation.md` 已记录以上全部 9 条命令与结果，并注明无聚合 smoke runner 这一事实

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `harness/changes/gate-tightening-skeleton/reviews/verification-reviewer.json`

- [ ] 写失败测试（不适用，见上）
- [ ] 运行 RED 命令（不适用，见上）
- [ ] 实现最小 GREEN 改动（不适用，本任务不改代码）
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review

