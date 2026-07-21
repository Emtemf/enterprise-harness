# Tasks

Status: plan-ready

> `plan-critic` 第三轮复审已 pass（2026-07-21）。本文件现可作为可执行 plan 消费，进入 TDD。

- clarify-ready: yes
- design-approved: yes (design-reviewer pass, 2026-07-21)
- plan-critic verdict: pass（第三轮复审, 2026-07-21）
- current active change: per-change-guide-card

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer
- 本阶段交接物：代码级执行切片 `tasks.md`

---

### Task 1: 先写 scaffold-guide 三态 smoke（RED-first，唯一职责=GUIDE 生成契约）

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs`

**Consumes**
- `harness/changes/per-change-guide-card/design.md`
- 现有 smoke 骨架：`/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs`
- 临时 repo 模式参考：
  - `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/snapshot-active-change-sync-smoke.mjs`
  - `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-execution-status-smoke.mjs`

**Produces**
- 一个唯一职责清晰的三态 smoke：`scaffold-guide-contract-smoke.mjs`
- **只覆盖**以下 GUIDE 生成契约：
  1. scaffold 自动生成 GUIDE.md
  2. 占位符已替换（无 `{{` 残留）
  3. change-id / tier / impact 实际值写入
  4. GUIDE.md 中存在可直接执行的验收命令区块与命令路径：
     - `node harness/plugin/runtime/cli.mjs verify`
     - `node harness/plugin/runtime/cli.mjs doctor`
     - `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs verify`
     - `node harness/plugin/runtime/lifecycle.mjs show-active`

**Implementation Order**
1. 先按现有 smoke 风格写 `red|green|verify` 三态骨架
2. 在临时目录复制最小 repo 结构并运行 lifecycle/scaffold，不污染真实 `harness/changes/`
3. 先只写断言，不改生产实现

**Test-first Order**
1. 写 smoke
2. 运行 RED 命令，亲眼看到失败
3. 只有 RED 证据到手后，才允许进入 Task 2 改模板/生产实现

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs verify`
- Why authoritative: 它只验证 GUIDE 生成契约，不混入软门禁逻辑，边界稳定

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs red`
- Expected failure:
  - GUIDE.md 尚不会自动生成，或
  - 模板不存在/占位符残留，或
  - GUIDE.md 缺少验收命令区块/命令路径
  任一命中即退出非 0，证明 RED 成立。

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs green`
- Expected success:
  - GUIDE.md 存在
  - 不残留 `{{` 占位符
  - change-id / tier / impact 实际值写入
  - GUIDE.md 中存在 4 条可执行验收命令路径

**关键约束**
- 必须在 `os.tmpdir()` 下的临时 repo 执行；**绝不写真实 `harness/changes/`**
- 本 task 只写测试，不改任何生产文件

**Acceptance Checks**
- [ ] 只有一个测试文件名：`scaffold-guide-contract-smoke.mjs`
- [ ] RED/GREEN/VERIFY 命令可直接复制执行
- [ ] 临时目录模式明确，不污染真实仓库
- [ ] “验收命令自动填入”已被机械断言覆盖

**Review Target**
- Reviewer: plan-critic / verification-reviewer
- Output: verdict json

- [ ] 写失败测试
- [ ] 运行 RED 命令

---

### Task 2: 最小 GREEN 实现——模板 + scaffold 自动生成 GUIDE.md

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/templates/guide.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lifecycle.mjs`

**Consumes**
- Task 1 的 RED 证据
- `harness/work/per-change-guide-card/guide-prototype.md`（形态原型）
- `harness/templates/state.json`（impact 真实默认值来源）

**Produces**
- GUIDE 模板文件，含固定结构与 6 个占位符：
  `{{CHANGE_ID}}` `{{TIER}}` `{{IMPACT_API}}` `{{IMPACT_DATA}}` `{{IMPACT_ARCHITECTURE}}` `{{IMPACT_RULE}}`
- GUIDE 模板中预置 4 条可执行验收命令路径（非占位）：
  - `node harness/plugin/runtime/cli.mjs verify`
  - `node harness/plugin/runtime/cli.mjs doctor`
  - `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs verify`
  - `node harness/plugin/runtime/lifecycle.mjs show-active`
- `cmdScaffold` 自动生成 `GUIDE.md`：读模板 → `replaceAll` 填机械字段 → 写到 change 目录
- 幂等：GUIDE.md 已存在则不覆盖

**Implementation Order**
1. 先根据样品提炼稳定结构，业务内容区留 `<!-- 待填 -->`
2. 在 GUIDE 模板中写入 4 条可执行验收命令路径
3. 在 `cmdScaffold` 中，在现有 3 文件 copy 后新增 GUIDE 生成逻辑
4. 机械字段来源：
   - changeId = 入参
   - tier = 入参
   - impact = 读 state.json 现值；按模板真实默认值,初始应为 `unknown`

**Test-first Order**
1. 先确认 Task 1 的 RED 已发生
2. 仅做最小实现让 Task 1 的 GREEN 通过

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs green`
- Why authoritative: 直接验证模板 + scaffold + 验收命令区块的 GREEN 行为

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs green`
- Expected success:
  - GUIDE.md 生成成功
  - 无 `{{` 残留
  - change-id / tier / impact 实际值写入
  - impact 若未后续设置，初始值显示 `unknown`
  - 4 条验收命令路径出现在 GUIDE.md 中

**Refactor Boundary**
- 仅在 GREEN 全通过后，允许把占位符替换抽成小 helper（若确有必要）

**Acceptance Checks**
- [ ] `harness/templates/guide.md` 存在
- [ ] 6 个占位符齐全
- [ ] GUIDE.md 自动生成且幂等
- [ ] impact 默认值口径统一为 `unknown`
- [ ] 验收命令区块随模板/scaffold 一并落地

**Review Target**
- Reviewer: verification-reviewer
- Output: verdict json

- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下小幅重构（如需）

---

### Task 3: 先写 guide-reminder 三态 smoke（RED-first，唯一职责=软门禁提醒契约）

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs`

**Consumes**
- design 中 F1/F3 修订方案
- 现有 smoke 骨架：`/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs`
- 临时 repo 模式参考：
  - `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/snapshot-active-change-sync-smoke.mjs`
  - `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-execution-status-smoke.mjs`

**Produces**
- 一个唯一职责清晰的三态 smoke：`guide-reminder-contract-smoke.mjs`
- **只覆盖**以下软门禁提醒契约：
  1. 缺 GUIDE → `guideReminder` 非 null
  2. 有 GUIDE → `guideReminder` 为 null
  3. SessionStart 输出在缺失场景含 GUIDE 提醒
  4. `currentGap` 对既有场景逐字不变（F1 回归保护）

**Implementation Order**
1. 先写 `red|green|verify` 三态骨架
2. 在临时目录构造有/无 GUIDE 的 change fixture
3. 先只写断言，不改生产实现

**Test-first Order**
1. 写 smoke
2. 运行 RED 命令，亲眼看到失败
3. 只有 RED 证据到手后，才允许进入 Task 4 改生产实现

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs verify`
- Why authoritative: 它只验证 guideReminder / SessionStart / currentGap 回归保护，不混入 GUIDE 生成契约

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs red`
- Expected failure:
  - `guideReminder` 尚不存在,或
  - SessionStart 输出中无 GUIDE 提醒,或
  - `currentGap` 回归保护断言失败

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs green`
- Expected success:
  - 缺 GUIDE → `guideReminder` 非 null
  - 有 GUIDE → `guideReminder` 为 null
  - SessionStart 输出在缺失场景含 GUIDE 提醒
  - `currentGap` 对既有场景逐字不变

**关键约束**
- 必须在 `os.tmpdir()` 下的临时 repo 执行；**绝不写真实 `harness/changes/`**
- 本 task 只写测试，不改任何生产文件

**Acceptance Checks**
- [ ] 只有一个测试文件名：`guide-reminder-contract-smoke.mjs`
- [ ] RED/GREEN/VERIFY 命令可直接复制执行
- [ ] 临时目录模式明确，不污染真实仓库
- [ ] `currentGap` 回归保护已被机械断言覆盖

**Review Target**
- Reviewer: plan-critic / verification-reviewer
- Output: verdict json

- [ ] 写失败测试
- [ ] 运行 RED 命令

---

### Task 4: 最小 GREEN 实现——guideReminder 软门禁提示覆盖 SessionStart

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/workflow.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/session-start.mjs`

**Consumes**
- Task 3 的 RED 证据
- design 中 F1/F3 修订方案

**Produces**
- `computeGuideReminder(root, changeId)`：GUIDE.md 存在→`null`，缺失→提醒串
- `activeChangeSummary` 增 `guideReminder` 字段；`renderStatusSummary` 在非 null 时多渲染一行
- `hooks/session-start.mjs` 在现有输出中追加一行 GUIDE 提醒（仅在 `guideReminder` 非 null 时）
- **不改 `inferCurrentGap` / `currentGap` 文案与语义**

**Implementation Order**
1. 先确认 Task 3 的 RED 已发生
2. 在 `workflow.mjs` 增纯函数 `computeGuideReminder`
3. 在 `status-summary.mjs` 带出字段并支持渲染
4. 在 `session-start.mjs` 显式打印 `summary.activeChange?.guideReminder || null`

**Test-first Order**
1. 先确认 Task 3 的 RED 已发生
2. 仅做最小实现让 Task 3 的 GREEN 通过

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs green`
- Why authoritative: 直接验证软门禁提醒 GREEN 行为

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs green`
- Expected success:
  - 缺 GUIDE → `guideReminder` 非 null
  - 有 GUIDE → `guideReminder` 为 null
  - SessionStart 输出在缺失场景含 GUIDE 提醒
  - `currentGap` 对既有场景逐字不变

**Acceptance Checks**
- [ ] SessionStart 输出覆盖 GUIDE 提醒
- [ ] Stop 不覆盖（保持 design 非目标）
- [ ] `currentGap` 完全不变

**Review Target**
- Reviewer: verification-reviewer
- Output: verdict json

- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下小幅重构（如需）

---

### Task 5: 新增 durable 规则条目（对齐 rule=yes）

**Files**
- Create: `/home/wula/IdeaProjects/sdd/.claude/rules/45-guide-card.md`

**Consumes**
- design.md F2 修订方案

**Produces**
- 一条 durable 规则：每个 change 应有 GUIDE.md 导航卡；机械字段由 scaffold 自动生成；
  缺失软提醒不阻断；仅对新建 change 生效

**Implementation Order**
1. 按现有 `.claude/rules/*.md` 风格写规则（中文，与 40/50/60/70 一致）

**Project-native Build/Test Command**
- Primary command: `test -f /home/wula/IdeaProjects/sdd/.claude/rules/45-guide-card.md`
- Why authoritative: 当前 `verify` 不检查 45-guide-card.md 是否存在；文件存在性需用机械命令单独证明

**GREEN Evidence Point**
- Command: `test -f /home/wula/IdeaProjects/sdd/.claude/rules/45-guide-card.md`
- Expected success: exit code 0

**Acceptance Checks**
- [ ] `.claude/rules/45-guide-card.md` 存在
- [ ] 规则表述与 4 个 clarify 决策一致

**Review Target**
- Reviewer: verification-reviewer
- Output: verdict json

- [ ] 实现最小改动
- [ ] 运行定向验证

---

## 全局验收（verify 阶段消费）

1. `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs verify`
   - 证明：GUIDE 生成 / 机械字段填充 / 验收命令区块自动落地
2. `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs verify`
   - 证明：guideReminder / SessionStart 提醒 / currentGap 回归保护
3. `node harness/plugin/runtime/cli.mjs verify`
   - 证明：现有 contract checks 未退化
4. `node harness/plugin/runtime/cli.mjs doctor`
   - 证明：环境/required paths 基本健康
5. `test -f /home/wula/IdeaProjects/sdd/.claude/rules/45-guide-card.md`
   - 证明：新增 durable 规则文件存在
6. 全量现有 smoke（verify 模式）
   - Command:
     ```bash
     cd /home/wula/IdeaProjects/sdd && \
     pass=0; fail=0; \
     for f in harness/plugin/runtime/test/*smoke*.mjs; do \
       node "$f" verify >/tmp/o 2>&1 && pass=$((pass+1)) || { fail=$((fail+1)); echo "$f"; tail -20 /tmp/o; }; \
     done; \
     echo "PASS=$pass FAIL=$fail"; test "$fail" -eq 0
     ```
   - 证明：零退化（特别是 F1 的 currentGap 精确等值消费不受影响）
7. 跑完后 `git status --short`
   - 证明：真实 `harness/changes/` 未被测试污染
