# Tasks

Status: plan-approved

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer
- 本阶段交接物：`tasks.md`

- clarify-ready: true
- design-approved: true（`design-reviewer` pass，2026-07-22，一轮修正，见 `reviews/design-reviewer.json`）
- plan-critic verdict: pass（2026-07-22，一轮修正，见 `reviews/plan-critic.json`）
- current active change: `workflow-runner-fixture-isolation`

---

### Task 1: 安全采集 RED 证据（不污染真实仓库）

**Files**
- 不修改任何文件；本 task 只做一次性、可逆的观察动作

**Consumes**
- `design.md` "RED 证据采集的安全性" 一节（四步安全流程）

**Produces**
- 一份 RED 证据记录（观察结果 + 命令输出），确认当前实现确实把 `test-runner-smoke` 写进真实
  `harness/changes/`，且真实 `harness/ACTIVE_CHANGE` 被覆写

**Implementation Order（必须严格按顺序执行，均为具体命令，非文字描述）**

1. **采集前快照**（回应 plan-critic F2：必须区分"文件原本不存在" vs "文件原本存在但内容为空"，
   两者混用 `printf` 恢复会把"不存在"错误恢复成"存在且为空的文件"，而 `harness/ACTIVE_CHANGE` 被
   `.gitignore` 忽略、`git status` 也测不出这个漂移）：
   ```bash
   ACTIVE_CHANGE_PATH=/home/wula/IdeaProjects/sdd/harness/ACTIVE_CHANGE
   if [ -f "$ACTIVE_CHANGE_PATH" ]; then
     ORIGINAL_ACTIVE_CHANGE_EXISTED=1
     ORIGINAL_ACTIVE_CHANGE="$(cat "$ACTIVE_CHANGE_PATH")"
   else
     ORIGINAL_ACTIVE_CHANGE_EXISTED=0
     ORIGINAL_ACTIVE_CHANGE=""
   fi
   echo "snapshot: existed=$ORIGINAL_ACTIVE_CHANGE_EXISTED content=[$ORIGINAL_ACTIVE_CHANGE]"
   ls /home/wula/IdeaProjects/sdd/harness/changes/test-runner-smoke 2>&1 || echo "confirmed: test-runner-smoke not present before RED collection"
   ```
2. **运行现有（未修复）实现观察 RED**：
   ```bash
   node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-runner-smoke.mjs green; echo "exit=$?"
   ```
   （回应 plan-critic F1：red/green/verify 三种 mode 在真正执行 `run/resume/status` 并计算 `ok` **之前**的
   代码路径完全一致——mode 只影响判定 `ok` 之后走哪个分支。也就是说 `red` 模式**同样会**对真实仓库产生完整
   副作用，不存在"red 模式天然安全、不会污染"这回事。这里选用 `green` 只是因为它是本 task 最终想验证的目标
   状态；用哪个 mode 跑，产生的真实仓库副作用都一样，四步快照-恢复流程必须对任意 mode 都生效）
3. **验证污染确实发生**（这是 RED 的核心证据）：
   ```bash
   ls -la /home/wula/IdeaProjects/sdd/harness/changes/test-runner-smoke 2>&1
   cat /home/wula/IdeaProjects/sdd/harness/ACTIVE_CHANGE 2>&1
   ```
   预期：由于脚本自身第 51 行的 `process.on('exit', cleanup)`（真正生效的清理机制，见 Task 2"清理机制"
   专项说明，不是第 86-88 行的 `finally`）会在进程退出前删除 `harness/changes/test-runner-smoke/`，
   第一条命令预期已经不存在（cleanup 生效）；但 `harness/ACTIVE_CHANGE` **预期仍被覆写为 `test-runner-smoke`**
   （因为现有 cleanup 从不恢复它）——这就是 RED 的核心证据：cleanup 不完整，验证真实污染确实存在
4. **采集后立即恢复**（存在性分支必须显式处理，不能只恢复内容）：
   ```bash
   if [ -d /home/wula/IdeaProjects/sdd/harness/changes/test-runner-smoke ]; then
     rm -rf /home/wula/IdeaProjects/sdd/harness/changes/test-runner-smoke
   fi
   if [ "$ORIGINAL_ACTIVE_CHANGE_EXISTED" = "1" ]; then
     printf '%s' "$ORIGINAL_ACTIVE_CHANGE" > "$ACTIVE_CHANGE_PATH"
   else
     rm -f "$ACTIVE_CHANGE_PATH"
   fi
   ```
5. **二次确认已恢复干净**（既确认内容一致，也确认存在性状态一致，而不仅仅是内容比较）：
   ```bash
   if [ "$ORIGINAL_ACTIVE_CHANGE_EXISTED" = "1" ]; then
     test -f "$ACTIVE_CHANGE_PATH" && [ "$(cat "$ACTIVE_CHANGE_PATH")" = "$ORIGINAL_ACTIVE_CHANGE" ] \
       && echo "confirmed: ACTIVE_CHANGE restored to original content" \
       || echo "MISMATCH: ACTIVE_CHANGE not correctly restored"
   else
     test ! -f "$ACTIVE_CHANGE_PATH" \
       && echo "confirmed: ACTIVE_CHANGE correctly absent (matches pre-collection state)" \
       || echo "MISMATCH: ACTIVE_CHANGE exists but should not"
   fi
   ls /home/wula/IdeaProjects/sdd/harness/changes/test-runner-smoke 2>&1 || echo "confirmed: cleaned up"
   git status --porcelain /home/wula/IdeaProjects/sdd/harness/ACTIVE_CHANGE 2>&1 || true
   ```
   预期：`ACTIVE_CHANGE` 内容与步骤 1 快照一致；`test-runner-smoke` 目录不存在

**Test-first Order**
不适用（本 task 是一次性观察动作，不是新增自动化测试）

**Project-native Build/Test Command**
- Primary command: 见 Implementation Order 步骤 1-5 的全部命令
- Why authoritative: 这是唯一能证明"当前实现确实污染真实仓库状态"的方式；必须真实执行一次才能构成
  有效 RED 证据，同时必须严格按四步流程执行才不会造成不可逆污染

**RED Evidence Point**
- Command: 见步骤 2-3
- Expected failure: 步骤 3 显示真实 `harness/ACTIVE_CHANGE` 被覆写为 `test-runner-smoke`（即使目录本身被
  cleanup 删除，ACTIVE_CHANGE 指针污染仍然发生）

**GREEN Evidence Point**
- 本 task 不产出 GREEN（RED 证据本身就是本 task 的完整产出，修复实现见 Task 2）

**Refactor Boundary**
- 不适用

**Acceptance Checks**
- [ ] 步骤 1-5 全部按顺序执行，且每步命令输出已记录
- [ ] 确认 RED 现象：`ACTIVE_CHANGE` 被覆写
- [ ] 确认采集后真实仓库已恢复到采集前状态（`ACTIVE_CHANGE` 内容一致、无残留目录）

**Review Target**
- Reviewer: 无独立 reviewer（Task 3 整体回归消费）
- Output: 步骤 1-5 的命令输出记录

- [ ] 写失败测试（不适用，本 task 是观察动作）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动（不适用，见 Task 2）
- [ ] 运行 GREEN 命令（不适用）
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 2: 修复 `workflow-runner-smoke.mjs` 为临时副本隔离执行

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-runner-smoke.mjs`

**Consumes**
- Task 1 的 RED 证据
- `design.md` Flow / State Changes（临时副本方案 + repoRoot 保持动态计算的决定）

**Produces**
- 新增 `copyDir(src, dest)` 辅助函数（跳过 `.git`/`.codegraph`，与既有隔离先例一致）
- 新增 `createTempRepo()`：`mkdtempSync` + `copyDir(repoRoot, repoCopy)`
- `repoRoot` 保持现有 `fileURLToPath(new URL('../../../../', import.meta.url))` 动态计算方式**不变**
- `runWorkflow()` 的 `cwd` 从 `repoRoot` 改为 `repoCopy`
- `changeDir` / `eventLogPath` 改为基于 `repoCopy` 而非 `repoRoot`
- `cleanup()` 改为只 `fs.rmSync(tempRoot, { recursive: true, force: true })`，不再触碰任何真实仓库路径
- 三处 `runWorkflow(repoRoot, [...])` 调用全部改为 `runWorkflow(repoCopy, [...])`
- **`process.on('exit', cleanup)` 这行必须保留并正确接线到新的 `tempRoot`**（见下方"清理机制"专项说明）

**⚠️ 清理机制（回应 plan-critic F3，本次修复的关键正确性要求）**

已实测确认：Node.js 中 `process.exit()` 会**跳过** `try/finally` 的 `finally` 块（`try{process.exit(0)}finally{...}`
不会执行 `finally` 内容）。而本文件的 `pass()`/`fail()` 全部走 `process.exit()`。当前 `workflow-runner-smoke.mjs`
第 51 行已经用 `process.on('exit', cleanup)` 单独注册退出钩子（这才是真正让 cleanup 生效的机制，而不是第 86-88
行的 `try{...}finally{cleanup()}`——那段 `finally` 在 `pass()`/`fail()` 走 `process.exit()` 的路径下**不会执行**，
只是防御性的兜底写法）。

**明确禁止**：Task 1 中提到的参考先例 `workflow-decision-smoke.mjs` 只依赖 `finally` 做 cleanup、**没有**
`process.on('exit', cleanup)` 这层保护——plan-critic 已在本机 `/tmp` 下现场发现至少 5 个该模式遗留的、
从未被清理的整仓临时副本，坐实这个"参考实现"本身的清理机制是失效的。如果 Task 2 照抄这个模式而不保留
`process.on('exit', cleanup)`，后果是把"污染真实仓库 `ACTIVE_CHANGE`"换成"每次运行都在 `/tmp` 泄漏一份整仓
副本"，且不会被任何断言发现（因为脚本本身的 `pass`/`fail` 判定跟这个泄漏无关）。

**具体要求**：
- `cleanup` 函数体改为只 `fs.rmSync(tempRoot, { recursive: true, force: true })`
- `process.on('exit', cleanup)` 这行**保持在文件顶层作用域**，且必须在 `tempRoot` 变量被赋值**之后**才注册
  （或 `cleanup` 内部对 `tempRoot` 做存在性判断，避免 `tempRoot` 尚未赋值时被引用报错）
- 保留 `try {...} finally { cleanup(); }` 结构本身作为双重防御（万一某条路径不是通过 `pass()`/`fail()`
  退出，比如抛未捕获异常），但**不能只依赖它**

**Implementation Order**
1. 在文件顶部新增 `copyDir`/`createTempRepo`（参考 `workflow-decision-smoke.mjs` 的目录复制实现方式，
   但**不**复制其硬编码 `repoRoot` 写法，**也不**复制其"只用 finally 做 cleanup"的清理机制——那个机制已被
   plan-critic 现场证实是失效的，见上方"清理机制"专项说明）
2. 修改 `changeId`/`changeDir` 计算：`changeDir = path.join(repoCopy, 'harness', 'changes', changeId)`
3. 修改三处 `runWorkflow(...)` 调用的 `cwd` 参数为 `repoCopy`
4. 修改 `eventLogPath` 为 `path.join(repoCopy, 'harness', 'changes', changeId, 'evidence', 'workflow-events.jsonl')`
5. 修改 `cleanup()` 函数体为只删除 `tempRoot`；确认 `process.on('exit', cleanup)` 这行仍然存在且在
   `tempRoot` 赋值之后注册
6. 在主流程最前面调用 `createTempRepo()`，取得 `tempRoot`/`repoCopy`；`try {...} finally { cleanup(); }`
   结构保留作为双重防御
7. 重跑 `green` 模式，确认原有断言逻辑（`runJson?.changeId`/`resumeJson?.nextAction`/`statusJson?.stage`/
   `eventLogExists` 等）在副本环境下依然成立
8. **验证清理机制真的生效**（这是本 task 独有的额外验收，Task 3 也会覆盖）：
   ```bash
   BEFORE_TMP_COUNT=$(ls -1d /tmp/workflow-runner-* 2>/dev/null | wc -l)
   node harness/plugin/runtime/test/workflow-runner-smoke.mjs green
   AFTER_TMP_COUNT=$(ls -1d /tmp/workflow-runner-* 2>/dev/null | wc -l)
   [ "$BEFORE_TMP_COUNT" = "$AFTER_TMP_COUNT" ] && echo "PASS: no /tmp leak" || echo "FAIL: /tmp leaked $((AFTER_TMP_COUNT - BEFORE_TMP_COUNT)) temp dir(s)"
   ```

**Test-first Order**
1. 沿用 Task 1 的 RED 观察结果作为"修复前"基线
2. 修复后运行 `green`，并额外验证真实仓库未被污染（见 Task 3 的验收步骤）

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/test/workflow-runner-smoke.mjs green`
- Why authoritative: 这是该测试自身的既定三态契约命令，修复后必须继续通过，证明隔离改动未破坏原有断言语义

**RED Evidence Point**
- 来源：Task 1 已采集

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/workflow-runner-smoke.mjs green`
- Expected success: 输出 `Green workflow-runner smoke passed.`，且原有 4 项断言
  （`runJson.changeId`/`resumeJson.nextAction`/`statusJson.stage`/`eventLogExists`）全部基于 `repoCopy` 内容成立

**Refactor Boundary**
- 仅允许整理变量命名/清理重复逻辑；不允许弱化原有 4 项断言

**Acceptance Checks**
- [ ] `repoRoot` 的动态计算方式未被替换成硬编码路径
- [ ] `runWorkflow` 全部 3 处调用都使用 `repoCopy` 作为 `cwd`
- [ ] `eventLogPath` 指向副本内路径
- [ ] `cleanup()` 只删除 `tempRoot`，不含任何真实仓库路径操作
- [ ] `process.on('exit', cleanup)` 保留且正确接线，不只依赖 `finally`
- [ ] `green` 模式通过，原有断言未被弱化
- [ ] 步骤 8 的 `/tmp` 泄漏检查结果为 PASS

**Review Target**
- Reviewer: 无独立 reviewer（Task 3 整体回归消费）
- Output: `green` 模式输出

- [ ] 写失败测试（复用 Task 1 的 RED 观察）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 3: 全量回归——确认真实仓库不再被污染 + 既有 verify

**Files**
- Modify: 无新增源码；仅执行验证命令

**Consumes**
- Task 2 的 GREEN 结果

**说明（回应 plan-critic F4 advisory）**：本次修复对"不污染真实仓库"这一目标的永久性断言，刻意放在
本 task 的外部 shell 脚本层（见下方 Implementation Order），而不是写进 `workflow-runner-smoke.mjs` 自身的
`.mjs` 断言逻辑里——因为该 `.mjs` 脚本每次运行本就应该在自己的 `repoCopy` 内产生变化，"真实仓库不受影响"
是一个**跨进程、跨仓库根**的外部观察点，用 shell 脚本在测试前后各拍一次真实仓库快照更直接，不需要为此在
`.mjs` 里引入额外的"自我审计"逻辑。

**Produces**
- 完整证据链，证明：
  1. `workflow-runner-smoke.mjs green` 通过
  2. 运行后真实仓库根下不存在 `harness/changes/test-runner-smoke/`
  3. 运行后真实 `harness/ACTIVE_CHANGE` 内容与运行前一致（未被污染）
  4. `node harness/plugin/runtime/cli.mjs verify` 全绿

**Implementation Order**
1. 记录运行前快照：
   ```bash
   BEFORE_ACTIVE_CHANGE="$(cat /home/wula/IdeaProjects/sdd/harness/ACTIVE_CHANGE 2>/dev/null || echo '')"
   ```
2. 运行：
   ```bash
   node harness/plugin/runtime/test/workflow-runner-smoke.mjs green
   ```
3. 验证真实仓库未被污染：
   ```bash
   AFTER_ACTIVE_CHANGE="$(cat /home/wula/IdeaProjects/sdd/harness/ACTIVE_CHANGE 2>/dev/null || echo '')"
   [ "$BEFORE_ACTIVE_CHANGE" = "$AFTER_ACTIVE_CHANGE" ] && echo "PASS: ACTIVE_CHANGE unchanged" || echo "FAIL: ACTIVE_CHANGE was mutated"
   ls /home/wula/IdeaProjects/sdd/harness/changes/test-runner-smoke 2>&1 || echo "PASS: test-runner-smoke not present in real repo"
   ```
4. 运行：
   ```bash
   node harness/plugin/runtime/cli.mjs verify
   ```
5. 更新 `harness/changes/workflow-runner-fixture-isolation/validation.md`

**Test-first Order**
不适用（本 task 是回归验证）

**Project-native Build/Test Command**
- Primary commands: 见 Implementation Order 1-4
- Why authoritative: 直接对应本 change 的业务目标——不是"测试通过"，而是"测试通过且不污染真实仓库"

**RED Evidence Point**
- 不适用（历史 RED 已在 Task 1 采集）

**GREEN Evidence Point**
- Commands: 同上
- Expected success: 全部命令 exit 0；`ACTIVE_CHANGE` 运行前后一致；`test-runner-smoke` 不存在于真实仓库

**Refactor Boundary**
- 不适用

**Acceptance Checks**
- [ ] `workflow-runner-smoke.mjs green` 通过
- [ ] 真实 `ACTIVE_CHANGE` 运行前后一致
- [ ] 真实仓库不存在 `harness/changes/test-runner-smoke/`
- [ ] `cli.mjs verify` 全绿
- [ ] `validation.md` 已记录以上全部命令与结果

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `harness/changes/workflow-runner-fixture-isolation/reviews/verification-reviewer.json`

- [ ] 写失败测试（不适用）
- [ ] 运行 RED 命令（不适用）
- [ ] 实现最小 GREEN 改动（不适用，本任务不改代码）
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review
