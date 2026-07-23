# Tasks

Status: plan-approved

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer
- 本阶段交接物：`tasks.md`

- clarify-ready: true
- design-approved: true（`design-reviewer` pass，2026-07-22，见 `reviews/design-reviewer.json`）
- plan-critic verdict: pass（2026-07-22，见 `reviews/plan-critic.json`）
- current active change: `openapi-contract-check-generalization`

---

### Task 1: 先写 JS 侧 RED 测试（结构扫描 + hook 集成）

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs`

**Consumes**
- `design.md` Flow / State Changes（`findOpenApiYamlFiles(root)` 算法、`validateOpenApiLight` 错误消息格式）
- `design.md` Testing Strategy（多模块、多 openapi 目录、黑名单目录排除、非 `reference-service` 路径 hook 生效）

**Produces**
- `checks-openapi-scan-unit-smoke.mjs`：直接 `import { validateOpenApiLight } from '../lib/checks.mjs'`
  做临时目录级函数验证
- `post-write-openapi-scan-smoke.mjs`：真实 `spawnSync('node', [postWritePath], { cwd: tempRepo, input: ... })`
  验证 `post-write.mjs` 已经会把非 `reference-service` 命名路径下的 OpenAPI 结构错误拦出来

**Implementation Order**
1. 先写 `checks-openapi-scan-unit-smoke.mjs`，覆盖以下用例：
   - `reference-service/openapi/order-service.yaml`（向后兼容基线）
   - `foo-service/openapi/spec.yaml`（核心修复点：非 reference-service 命名也能命中）
   - 多模块：`module-a/openapi/a.yaml` + `module-b/openapi/b.yaml`，其中一个缺 `components:`
   - 生成物目录黑名单：`some-module/target/generated/openapi/spec.yaml` 不应被检测到
   - 无任何 `openapi` 目录时返回空数组
2. 再写 `post-write-openapi-scan-smoke.mjs`，**夹具必须机械固定成一个“只会因 OpenAPI 结构错误而失败、不会被其他 gate 抢先拦截”的最小合法仓库副本**：
   - 基底：先 `copyDir(repoRoot, repoCopy)` 复制整仓（沿用本仓库既有 smoke 模式），保证 `.claude/`、`AGENTS.md`、`harness/specs/`、`harness/templates/` 等 `validateStructure` 所需文件完整存在
   - 然后 `fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true })` 清空 change 目录，避免其他真实 change 的 artifact/review/state 问题污染本次断言
   - 再在副本里只注入一个最小合法 change（如 `openapi-structure-smoke`）：补齐 `state.json`、`change.md`、`validation.md`、`evidence/tooling.md`，使 `validateArtifactStates`/`validateReviewVerdicts`/`validateChangeEvidence` 都通过，不提前失败
   - 在 `order-service/openapi/order-service.yaml` 写一个缺 `paths:` 的 YAML（非 `reference-service` 命名，直击本次修复点）
   - stdin 固定传 `JSON.stringify({ tool_input: { file_path: '<repoCopy>/order-service/openapi/order-service.yaml' } })` 给 `post-write.mjs`
   - 断言 stderr/stdout 含 `openapi:` 错误（带相对路径），退出非 0
3. 先不修改生产代码，直接跑这两个测试，观察 RED

**Test-first Order**
1. `checks-openapi-scan-unit-smoke.mjs red`
   - 预期：非 `reference-service` 的 `foo-service/openapi/spec.yaml` 与多模块场景当前检测不到，脚本应 fail
2. `post-write-openapi-scan-smoke.mjs red`
   - 预期：当前 `post-write.mjs` 对 `order-service/openapi/order-service.yaml` 结构错误静默放过（因为 `validateOpenApiLight` 只看硬编码 demo 路径），脚本应 fail
   - 且失败原因必须明确归因于“未报出 openapi 结构错误”，而不是被 `validateStructure`/`validateArtifactStates`/`validateReviewVerdicts`/`validateChangeEvidence` 抢先拦截（测试实现里要对输出做负断言，确保这些前置 gate 的错误字符串不存在）

**Project-native Build/Test Command**
- Primary commands:
  - `node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs red`
  - `node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs red`
- Why authoritative: 这两个 smoke 直接验证本次修复真正要解决的两个入口——纯函数扫描逻辑，以及 `post-write.mjs` 的实际 hook 集成效果；其中第二个是必需的真实集成证据，避免只修函数不修调用路径

**RED Evidence Point**
- Commands: 同上
- Expected failure:
  - unit smoke 因非 `reference-service` 路径检测不到而 fail
  - hook smoke 因 `post-write.mjs` 未报出非 demo OpenAPI 错误而 fail

**GREEN Evidence Point**
- Commands:
  - `node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs green`
  - `node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs green`
- Expected success:
  - unit smoke 全部通过，且多模块错误消息包含具体相对路径（不只是 pattern）
  - hook smoke 对非 demo OpenAPI 结构错误能真实拦截

**Refactor Boundary**
- 只允许整理测试辅助函数（临时目录/写文件/复制仓库），不允许弱化断言

**Acceptance Checks**
- [ ] unit smoke 覆盖向后兼容、非 demo、多模块、黑名单、无 openapi 五类场景
- [ ] hook smoke 证明 `post-write.mjs` 的真实调用链已经受益于泛化
- [ ] 两个 smoke 都在修前真实 RED

**Review Target**
- Reviewer: 无独立 reviewer（Task 5 全量回归 + `verification-reviewer` 消费）
- Output: 两个 smoke 的 RED/GREEN 输出

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 2: 实现 JS 侧泛化与改名（checks.mjs + gates.mjs + 调用点）

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/gates.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/post-write.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/verify.mjs`

**Consumes**
- Task 1 的两个 RED 测试
- `design.md` Selected Option / Flow / Interface Contract

**Produces**
- `gates.mjs`：把现有 `GOVERNANCE_BLOCKLIST` 改为导出（值不变）
- `checks.mjs`：
  - 新增内部函数 `findOpenApiYamlFiles(root)`
  - `validateOpenApiLight(root)` 改为遍历全部探测到的 YAML 文件并逐一校验 `openapi:`/`paths:`/`components:`
  - 错误格式改为 `openapi:${relPath}:${pattern}`
  - `validateControllerConsistency` 改名为 `validateReferenceServiceControllerConsistency`
  - 新增函数顶部注释，明确它仅用于 `reference-service` 自身回归，不是通用校验器
- `post-write.mjs` / `verify.mjs`：同步改 import 名字与调用点

**Implementation Order**
1. 在 `gates.mjs` 仅做最小导出变更（不改黑名单值）
2. 在 `checks.mjs` 先实现 `findOpenApiYamlFiles(root)`：
   - DFS 深度上限 12
   - 跳过 `GOVERNANCE_BLOCKLIST`
   - `openapi` 目录命中后收集直接下级 `*.yaml|*.yml`
   - 继续遍历其他目录以支持多模块
   - 处理 design.md 明确的边界：root 自身名为 `openapi`、符号链接目录不跟随
3. 改写 `validateOpenApiLight` 为多文件扫描版本
4. 改名 `validateControllerConsistency` → `validateReferenceServiceControllerConsistency`
5. 同步更新 `post-write.mjs` / `verify.mjs` 的 import 与调用
6. 重跑 Task 1 的两个 smoke 看 GREEN

**Test-first Order**
1. 先看 Task 1 两个 RED
2. 完成实现后看 Task 1 两个 GREEN
3. 再补一条只读回归：
   - `node harness/plugin/runtime/cli.mjs verify`
   - 确认改名没打断调用链

**Project-native Build/Test Command**
- Primary commands:
  - `node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs green`
  - `node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs green`
  - `node harness/plugin/runtime/cli.mjs verify`
- Why authoritative: 分别覆盖函数层、hook 集成层、仓库统一验证入口

**RED Evidence Point**
- 来源：Task 1 已观察到的 RED

**GREEN Evidence Point**
- Commands: 同上
- Expected success:
  - 两个 smoke 全绿
  - `cli.mjs verify` 不因函数改名/导出变更而报错

**Refactor Boundary**
- 只允许整理辅助函数/常量位置与注释；不允许在未补证据前继续扩大 `validateControllerConsistency` 的语义范围

**Acceptance Checks**
- [ ] 非 `reference-service` 命名的 openapi 目录可被 JS 侧检测到
- [ ] 多模块错误消息含具体相对路径
- [ ] 黑名单目录排除仍生效
- [ ] `validateReferenceServiceControllerConsistency` 改名后调用链完整

**Review Target**
- Reviewer: 无独立 reviewer（Task 5 整体回归消费）
- Output: Task 1 两个 smoke 的 GREEN 输出 + `cli.mjs verify` 输出

- [ ] 写失败测试（已在 Task 1 完成）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 3: 实现 shell 脚本侧泛化与诚实重新定位（高风险：find 语义）

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/verify-scripts/validate-openapi.sh`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/verify-scripts/validate-controller-consistency.sh`

**Consumes**
- `design.md` 对 shell 方案的修正（`cd "$ROOT" && find . ... -prune ... -name openapi -print`）
- design-reviewer 的 blocker：绝对路径 `$ROOT` 含 `build/target` 等词时旧 `-not -path` 方案会误伤

**Produces**
- `validate-openapi.sh`：
  - 先 `cd "$ROOT"`
  - 用 `find . ... -prune ... -name openapi -print` 枚举 openapi 目录
  - 对每个目录直接下级 `*.yaml|*.yml` 文件逐一做 3 条 `grep` pattern 检查
  - 错误消息带相对路径
- `validate-controller-consistency.sh`：逻辑不变，但顶部加注释，明确它刻意不改名且只用于 reference-service 自身回归

**Implementation Order**
1. 先做一个最小 shell RED 复现实验（不是新建 repo 内测试文件，而是在 TDD 过程中记录为命令证据），**命令固定为**：
   ```bash
   TMP="$(mktemp -d)"
   mkdir -p "$TMP/build/reference-service/openapi"
   cat > "$TMP/build/reference-service/openapi/order-service.yaml" <<'YAML'
   openapi: 3.0.0
   paths: {}
   components: {}
   YAML
   find "$TMP/build/reference-service" -type d -name openapi -not -path '*/target/*' -not -path '*/build/*' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/out/*'
   ```
   预期 RED：输出为空（误伤）
2. 按 design 改写 `validate-openapi.sh`
3. 用**同一个**临时目录重跑修正后的 GREEN 命令，命令固定为：
   ```bash
   cd "$TMP/build/reference-service" && find . -type d \( -name target -o -name build -o -name node_modules -o -name .git -o -name dist -o -name out \) -prune -o -type d -name openapi -print
   ```
   预期 GREEN：输出 `./openapi`
4. 再补第二个 shell 回归场景，命令固定为：
   ```bash
   mkdir -p "$TMP/foo-service/target/generated/openapi"
   cat > "$TMP/foo-service/target/generated/openapi/spec.yaml" <<'YAML'
   openapi: 3.0.0
   paths: {}
   components: {}
   YAML
   cd "$TMP/foo-service" && find . -type d \( -name target -o -name build -o -name node_modules -o -name .git -o -name dist -o -name out \) -prune -o -type d -name openapi -print
   ```
   预期 GREEN：输出只含 `./openapi`（若无合法 openapi 目录则输出为空），**绝不能**出现 `./target/generated/openapi`
5. 给 `validate-controller-consistency.sh` 补注释，不改文件名/逻辑
6. TDD 命令执行完毕后清理：`rm -rf "$TMP"`

**Test-first Order**
1. `$ROOT` 自身路径含 `build` 字段时，旧 `-not -path` 方案误伤（RED 复现）
2. 修正后同场景能找到合法 `./openapi`
3. 子目录中的 `target/openapi` 仍被排除

**Project-native Build/Test Command**
- Primary commands（需如实记录到 validation.md）：
  - 一组 `mktemp` + `mkdir -p` + `echo` + `find`/`bash validate-openapi.sh` 的 shell 复现命令
  - `bash harness/plugin/runtime/verify-scripts/validate-openapi.sh`
- Why authoritative: shell 侧这轮没有单独的新 smoke 文件，必须靠真实 bash 命令复现实测；这正是 design-reviewer 指出的核心 blocker

**RED Evidence Point**
- Command shape: 临时目录中复现 `$ROOT` 自身路径含 `build`，运行旧 `find "$ROOT" ... -not -path ...`
- Expected failure: 输出为空（误伤）

**GREEN Evidence Point**
- Command shape: 同样临时目录，运行修正后的 `cd "$ROOT" && find . ... -prune ...`
- Expected success: 能找到合法 `./openapi`；同时 `target/generated/openapi` 不被找到

**Refactor Boundary**
- 只允许整理 shell 变量/注释，不允许把 shell 侧问题“假装靠 JS 测试覆盖”而跳过真实 bash 验证

**Acceptance Checks**
- [ ] shell 方案已从绝对路径 `-not -path` 改为相对路径 `find . ... -prune`
- [ ] `$ROOT` 自身路径含黑名单词时不再误伤
- [ ] `target/openapi` 仍被排除
- [ ] `validate-controller-consistency.sh` 注释明确"刻意不改名"与"仅用于 reference-service 回归"

**Review Target**
- Reviewer: 无独立 reviewer（Task 5 整体回归消费）
- Output: shell RED/GREEN 实测命令与输出摘要

- [ ] 写失败测试（以 shell RED 命令形式体现）
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 4: 更新规则/文档表述，诚实反映能力边界

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/.claude/rules/60-api-contract.md`
- Modify: `/home/wula/IdeaProjects/sdd/CLAUDE.md`

**Consumes**
- `design.md` Scope / Non-goals / Business Result
- Task 2/3 的实际实现结果

**Produces**
- `.claude/rules/60-api-contract.md`：把"现有 hook 仍以轻量 marker 检查为主"更新成更准确的现状：
  - OpenAPI 结构检查已泛化到任意 `openapi` 目录下的 YAML 文件
  - controller consistency 仍是 reference-service 自身轻量回归，不是通用能力
- `CLAUDE.md:81-87` 附近：同步修正文案，不再让人误以为两个轻量脚本都是通用校验器

**Implementation Order**
1. 先完成 Task 2/3 的代码实现（否则文案会和实际不符）
2. 再更新这两个文档文件
3. 重跑 `cli.mjs verify`（确认文档改动未引入模板/结构问题）

**Test-first Order**
不适用（文档表述依赖实现完成后的事实）

**Project-native Build/Test Command**
- Primary command: `node harness/plugin/runtime/cli.mjs verify`
- Why authoritative: 文档改动会被仓库统一 contract-check 覆盖；本 task 的正确性主要靠"表述是否与已完成实现一致"的人工 review + verify 保底

**RED Evidence Point**
- 不适用

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/cli.mjs verify`
- Expected success: contract checks 通过，且人工复核文档表述与代码实现一致

**Refactor Boundary**
- 仅允许表述收敛，不允许趁机扩大承诺（例如把 reference-service 自检说成通用 controller linter）

**Acceptance Checks**
- [ ] rules/CLAUDE.md 都诚实反映"结构检查已泛化、controller consistency 仍是 demo 自检"的现实
- [ ] 未夸大成通用能力

**Review Target**
- Reviewer: 无独立 reviewer（Task 5 整体回归消费）
- Output: `cli.mjs verify` 输出 + 人工复核摘要

- [ ] 写失败测试（不适用）
- [ ] 运行 RED 命令（不适用）
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

---

### Task 5: 全量回归（JS + shell + verify）

**Files**
- Modify: 无新增源码；执行 Task 1-4 涉及的测试/命令

**Consumes**
- Task 1-4 的全部 GREEN 结果

**Produces**
- 一份完整回归证据，证明：
  1. JS 侧 unit smoke 全绿
  2. hook 集成 smoke 全绿
  3. shell 侧修正的 `find -prune` 方案在 reviewer 指出的根路径误伤场景下真实有效
  4. `cli.mjs verify` 全绿
  5. `validateReferenceServiceControllerConsistency` 改名后，reference-service 自身的回归能力未被破坏

**Implementation Order**
1. 运行：
   ```
   node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs green
   node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs green
   ```
2. 重跑 Task 3 的 shell 实测命令，保留 stdout/stderr 作为最终证据
3. 运行：
   ```
   node harness/plugin/runtime/cli.mjs verify
   ```
4. 额外 shell spot-check（不是 JS 改名回归的必经证明，但用于确认 shell 侧 reference-service 自检未被破坏）：
   - 运行 `bash harness/plugin/runtime/verify-scripts/validate-controller-consistency.sh`
   - 证明注释更新未破坏 demo 自检脚本本身；**JS 改名回归的主证据仍以前三步的 hook smoke + cli.mjs verify 为准**
5. 更新 `harness/changes/openapi-contract-check-generalization/validation.md`

**Test-first Order**
不适用（本 task 是整体回归）

**Project-native Build/Test Command**
- Primary commands: 见 Implementation Order 1-4
- Why authoritative: 覆盖本次改动的三个执行面——JS 函数、hook 集成、shell 脚本，以及仓库统一验证入口

**RED Evidence Point**
- 不适用

**GREEN Evidence Point**
- Commands: 见 Implementation Order
- Expected success: 全部命令 exit 0 / 输出符合预期

**Refactor Boundary**
- 不适用

**Acceptance Checks**
- [ ] unit smoke / hook smoke 全绿
- [ ] shell 根路径误伤场景已用真实命令复核通过
- [ ] `cli.mjs verify` 全绿
- [ ] reference-service 自身 controller consistency 回归未被破坏
- [ ] `validation.md` 记录完整命令与结果

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/openapi-contract-check-generalization/reviews/verification-reviewer.json`

- [ ] 写失败测试（不适用）
- [ ] 运行 RED 命令（不适用）
- [ ] 实现最小 GREEN 改动（不适用，本 task 不改代码）
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构（不适用）
- [ ] 运行定向验证
- [ ] 运行 task review
