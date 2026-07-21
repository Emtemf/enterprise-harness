# Tasks

Status: draft-plan

## Preconditions
- clarify-ready: issue #10 scope 已收窄为 launcher / help / readiness separation / upstream-check mismatch
- design-approved: waiting for rerun verdict
- plan-critic verdict: waiting for rerun verdict
- current active change: `runtime-productization-polish`
- execution note: 在 `state.json` 仍为 `workflow.stage=design`、`gates.designApproved=false`、`workflow.planReady=false` 时，不得进入实现；本文件仅定义通过 gate 后可执行的 task contract

## Plan Freezes
- `verify` 本轮不拆新命令；继续保留 `node harness/plugin/runtime/cli.mjs verify`
- `verify` 新 JSON contract 固定包含：`ok`、`contractChecks`、`runtimeReadinessChecks`
- `runtimeReadinessChecks.status` 本轮固定为 `not-run`
- `upstream-check` 对 `runtime-upstream` 的 validated version mismatch 固定为 exit 1 + `status=validated-version-mismatch`
- `reference-upstream` 继续 `expectedVersion=manual-review`，不参与自动 mismatch fail
- launcher / external-cwd 只收紧 package-relative repo entry，不扩展全局安装 wrapper
- Task 1 所有 local adapter 判据必须固定 `HARNESS_LOCAL_ADAPTER=<temp>/local-adapter.json`
- Task 1 的 `.bootstrap-ran` 判据必须采用“前后状态不变”，不得假设仓库初始不存在该 marker
- Task 3 所有 registry mismatch 判据必须固定 `HARNESS_UPSTREAM_REGISTRY=<temp>/registry.json`
- Task 3 的长期稳定规范唯一 SoT 为 `harness/specs/runtime-contract.md`；change-local spec 仅保留过程留痕

### Task 1: 统一 help / usage / no-side-effect 契约

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/install.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/update.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/upgrade.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/migrate.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/release-local.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs`

**Consumes**
- current CLI entry behavior
- issue #10 audit notes on `--help` side effects

**Produces**
- stable help / usage / exit-code contract
- no-side-effect help behavior

**Fixture Contract**
- 在 temp 目录下创建 `help-fixture/`
- 所有 smoke 子进程统一注入：`HARNESS_LOCAL_ADAPTER=<temp>/help-fixture/local-adapter.json`
- 预置用例：先写入 `local-adapter.json`，记录文件内容 SHA-256 与 mtimeMs
- 非预置用例：确认 `local-adapter.json` 起始不存在
- 记录 help 前后 `os.tmpdir()` 下 `enterprise-harness-release-local-*` 目录列表
- 记录 repo 内 `harness/plugin/runtime/.bootstrap-ran` 的前置存在性、SHA-256 与 mtimeMs

**Assertion Matrix**
- `node .../install.mjs --help` → exit `0`，stdout 第一行包含 `Enterprise Harness Install` 或稳定 usage，且 `.bootstrap-ran` 前后状态不变
- `node .../install.mjs -h` → exit `0`，同上
- `node .../update.mjs --help` / `-h` → exit `0`
- `node .../upgrade.mjs --help` / `-h` → exit `0`
- `node .../migrate.mjs --help` / `-h` → exit `0`
- `node .../release-local.mjs --help` / `-h` → exit `0`
- `update/migrate --help` 在预置 local adapter fixture 时：文件仍存在、SHA-256 不变、mtimeMs 不变
- `update/migrate --help` 在非预置 local adapter fixture 时：文件仍不存在
- `install --help` 后 `.bootstrap-ran` 的前置存在性、SHA-256、mtimeMs 保持不变
- `release-local --help` 前后 `enterprise-harness-release-local-*` temp 目录数量不增加
- `node .../cli.mjs` → exit `0`，stdout 包含 `Enterprise Harness Runtime CLI`
- `node .../cli.mjs no-such-command` → exit `1`，stderr 包含 `Unknown command:`

- [ ] 写失败测试
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs red`
  - Expected failure: 当前 `install/update/upgrade/migrate` 至少一项不满足 `--help` / `-h` / no-side-effect 契约
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs green`
  - Expected pass: 上述 assertion matrix 全部满足
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs verify`
  - Verify focus: help titles / usage / exit code / `.bootstrap-ran` state invariance / temp dir / local adapter fixture hash+mtime 判据无回退
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-productization-polish/reviews/verification-reviewer-task1.json`

### Task 2: 收紧 launcher / external-cwd / argv boundary

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/context7.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs`

**Consumes**
- current process.cwd() assumptions
- issue #10 audit notes on Windows multi-word query splitting and external-cwd launcher problems

**Produces**
- stronger external-cwd launcher contract
- safer argv boundary for Context7 wrapper

**Fixture Contract**
- 创建 temp 目录：`outside-cwd/`
- 从 `outside-cwd/` 使用绝对路径运行 `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs status`
- PATH 前置 stub `npx`，把收到的 argv 序列化到 temp json 文件
- 从 `outside-cwd/` 运行 `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/context7.mjs docs /react/react "use effect examples"`

**Assertion Matrix**
- external-cwd 调 repo 内 `cli.mjs status` 成功，stdout 包含精确标题 `Enterprise Harness Status`
- `context7.mjs` 下游 argv 观测文件精确等于：`["-y","ctx7","docs","/react/react","use effect examples"]`
- query `use effect examples` 必须作为单个参数保留，不得被拆成多个词

- [ ] 写失败测试
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs red`
  - Expected failure: 当前 external-cwd 调 repo 内 `cli.mjs status` 失败，或 argv 观测不满足单参数边界
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs green`
  - Expected pass: external-cwd / argv assertion matrix 全部满足
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs verify`
  - Verify focus: package-relative repo resolution、状态标题、multi-word query 参数边界稳定
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-productization-polish/reviews/verification-reviewer-task2.json`

### Task 3: 收紧 verify readiness separation 与 upstream-check mismatch

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/verify.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/upstream-check.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/runtime-contract.md`
- Update trace copy: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-productization-polish/specs/runtime-contract.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs`

**Consumes**
- current verify JSON / upstream-check output
- issue #10 audit notes on readiness separation and version mismatch visibility

**Produces**
- clearer contract/readiness boundary
- explicit validated-version mismatch surface
- runtime docs that no longer overstate verify semantics

**Fixture Contract**
- 直接运行 `verify.mjs --json` 与 human output，检查旧字段/文案不满足新契约
- PATH 前置 `codegraph` / `npx` stub，返回受控版本字符串
- smoke 创建 `<temp>/registry.json`，并通过 `HARNESS_UPSTREAM_REGISTRY=<temp>/registry.json` 注入给 `upstream-check.mjs`
- temp registry fixture 固定包含：
  - `CodeGraph`：`currentValidatedVersion` 与 stub 输出一致
  - `Context7`：`currentValidatedVersion` 与 stub 输出不一致
  - `referenceUpstreams[*].expectedVersion=manual-review`
- docs assertions 采用精确字符串断言

**Assertion Matrix**
- `verify --json` 顶层包含 `ok`、`contractChecks`、`runtimeReadinessChecks`
- `contractChecks` 包含 `ok`、`problems`、`todoHits`
- `runtimeReadinessChecks.status === 'not-run'`
- `runtimeReadinessChecks.guidance` 至少提及 `doctor --json`、`sync --json`、`upstream-check --json`
- `verify` human output 不再包含 `OK contract and runtime checks passed.`
- `verify` human output 改为明确 contract passed + runtime readiness needs separate commands
- `upstream-check --json` mismatch 时 `result.ok === false`
- mismatch 的 `runtime-upstream` check 包含 `status=validated-version-mismatch`
- mismatch human output 明确打印 `status=validated-version-mismatch` 与 `current=... expected=...`
- `reference-upstream` 继续 `expectedVersion=manual-review`，且不因 observed version 字符串本身失败
- `/home/wula/IdeaProjects/sdd/README.md` 必须包含精确字符串：`verify 只声明 contract checks；runtime readiness 需另行运行 doctor / sync / upstream-check。`
- `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/README.md` 必须包含精确字符串：`runtime readiness 不由 verify 单独背书。`

- [ ] 写失败测试
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs red`
  - Expected failure: 当前 verify JSON/human output、upstream-check mismatch 结果、docs strings 不满足 assertion matrix
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs green`
  - Expected pass: verify/readiness/mismatch/docs assertion matrix 全部满足
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs verify`
  - Verify focus: JSON contract、human wording、docs exact strings、mismatch exit semantics 无回退
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-productization-polish/reviews/verification-reviewer-task3.json`
