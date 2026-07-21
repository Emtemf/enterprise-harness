# Design

## Requirement Alignment

本 change 对应 issue #10，目标是在 #13 的 local adapter diagnostics 收口、且当前仓库已有 fresh source-external release smoke 证据的基础上，继续把 runtime productization 的剩余缺口收口，而不是再回到局部子问题。

本轮设计必须冻结四类契约：

1. launcher / external-cwd 的 package-relative 行为
2. help / usage / exit-code / no-side-effect 行为
3. `verify` 中 contract checks 与 runtime readiness checks 的输出边界
4. `upstream-check` 对 validated version mismatch 的结构化结果与退出码

## Current-State Evidence

当前 runtime 现状：

- `cli.mjs` 通过 `spawnSync('node', [...commands[subcommand], ...rest], { cwd: process.cwd() })` 分发子命令，仍把当前工作目录当 repo root 使用
- `context7.mjs` 通过 `spawnSync('npx', ['-y', 'ctx7', action, ...args], { shell: process.platform === 'win32' })` 调起下游命令，Windows 下多词参数边界需要 smoke 固化
- `install.mjs` / `update.mjs` / `upgrade.mjs` / `migrate.mjs` 当前没有统一 `--help` / `-h` 契约，且 `install.mjs`、`update.mjs` 会直接执行真实动作
- `release-local.mjs` 已支持 `--help`，但其他 runtime entry 还未统一
- `verify.mjs` 当前只返回 `{ repoRoot, ok, problems, todoHits }` 并打印 `OK contract and runtime checks passed.`，容易把 contract/artifact 检查误表述成 machine-local readiness 绿灯
- `upstream-check.mjs` 当前只输出 `currentVersion` / `expectedVersion`，`result.ok` 仅由命令能否执行决定，validated version mismatch 不可见

## Selected Approach

### 1. launcher / external-cwd contract
本轮不改命令面，只收紧现有 façade：

- `node <repo>/harness/plugin/runtime/cli.mjs <command>` 必须能在 repo 外部 cwd 下工作
- repo root 通过入口脚本自身位置推导，而不是依赖调用时的 `process.cwd()`
- `release-local.mjs` 继续允许从 repo 内运行，但 smoke 明确覆盖“从外部 cwd 调 repo 内 cli entry”
- 本轮不扩展到完整全局安装 wrapper；只固化 package-relative launcher contract

### 2. help / usage / exit-code hygiene
本轮固定以下 entry 覆盖矩阵：

- `install.mjs`
- `update.mjs`
- `upgrade.mjs`
- `migrate.mjs`
- `release-local.mjs`
- `cli.mjs`

固定契约：

- `--help` 与 `-h`：退出码 `0`
- `--help` / `-h` 输出第一行必须为稳定标题或 usage，不允许为空
- `--help` / `-h` 不得创建文件、写 marker、写 temp repo、执行 bootstrap/setup/sync/doctor/verify/upstream-check 等真实动作
- `cli.mjs` unknown command：退出码 `1`，stderr 包含 `Unknown command:`
- `cli.mjs` 无 subcommand：退出码 `0`，stdout 包含 `Enterprise Harness Runtime CLI`

“无副作用”以可观察文件系统判据定义：

- `bootstrap.mjs` marker 判据必须记录 `harness/plugin/runtime/.bootstrap-ran` 的前置状态
- 若 marker 预先存在：help 前后其内容 hash 与 mtime 不变
- 若 marker 预先不存在：help 前后其存在性保持为不存在
- `release-local.mjs` 不得创建 `enterprise-harness-release-local-*` temp dir
- local adapter 判据必须使用测试专用 `HARNESS_LOCAL_ADAPTER=<temp>/local-adapter.json`
- 当 fixture 预置该文件时，help 前后必须满足：文件仍存在、内容 hash 不变、mtime 不变
- 当 fixture 不预置该文件时，help 前后必须满足：文件仍不存在

### 3. readiness separation
本轮不拆出 `verify-contract` / `verify-readiness` 新命令，继续保留：

- `node harness/plugin/runtime/cli.mjs verify`

但输出契约改为显式双层：

- `contractChecks`: repo contract / structure / review / evidence / TODO placeholder
- `runtimeReadinessChecks`: machine-local runtime checks 的摘要位（当前阶段只报告“verify 不涵盖 doctor/sync/upstream-check”这一边界提示，不在 `verify` 内重新执行这些命令）

固定 JSON 结果：

- `ok`: 仅表示 contract checks 是否通过
- `contractChecks.ok`
- `contractChecks.problems`
- `contractChecks.todoHits`
- `runtimeReadinessChecks.ok`
- `runtimeReadinessChecks.status`，本轮固定为 `not-run`
- `runtimeReadinessChecks.guidance`，至少包含运行 `doctor --json`、`sync --json`、`upstream-check --json`

固定 human output：

- 绿灯时不得再输出 `OK contract and runtime checks passed.`
- 改为明确表达 `OK contract checks passed.`
- 并额外打印一行说明 runtime readiness 需另行通过 `doctor` / `sync` / `upstream-check` 判断

### 4. upstream-check mismatch 可见
本轮冻结 fail/warn matrix：

- `runtime-upstream`：
  - 命令不可执行 → `ok=false`，退出码 `1`
  - 命令可执行但 `currentVersion !== expectedVersion` → `ok=false`、`status=validated-version-mismatch`、退出码 `1`
  - 命令可执行且版本匹配 → `ok=true`、`status=validated-version-match`
- `reference-upstream`：
  - 继续 `expectedVersion=manual-review`
  - 不参与自动 mismatch fail

固定每个 check 的结构化字段：

- `name`
- `kind`
- `ok`
- `status`
- `currentVersion`
- `expectedVersion`

human output 必须显式打印 mismatch：

- `FAIL runtime-upstream: CodeGraph`
- `status=validated-version-mismatch`
- `current=... expected=...`

### 5. Windows / argv / shell 边界
本轮不新建通用 wrapper，只收紧 `context7.mjs`：

- 保持 `spawnSync('npx', ['-y', 'ctx7', action, ...args])` 的 argv 数组方式
- smoke 通过 PATH stub 观测下游接收到的原始 argv，断言多词 query 仍保持单参数边界
- 测试不依赖真实 `ctx7` 网络访问

## Affected Files

### 必改
- `harness/plugin/runtime/cli.mjs`
- `harness/plugin/runtime/context7.mjs`
- `harness/plugin/runtime/verify.mjs`
- `harness/plugin/runtime/upstream-check.mjs`
- `harness/plugin/runtime/install.mjs`
- `harness/plugin/runtime/update.mjs`
- `harness/plugin/runtime/upgrade.mjs`
- `harness/plugin/runtime/migrate.mjs`
- `README.md`
- `harness/plugin/runtime/README.md`

### 新增
- `harness/specs/runtime-contract.md`
- `harness/plugin/runtime/test/runtime-help-contract-smoke.mjs`
- `harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs`
- `harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs`

### 变更追踪资产
- `harness/changes/runtime-productization-polish/specs/runtime-contract.md`（只保留 change 过程留痕；最终稳定 SoT 以 `harness/specs/runtime-contract.md` 为准）

### 明确不改
- 不修改 local adapter diagnostics 语义
- 不修改 `release-local` 既有 fresh smoke 主流程语义
- 不修改 `.github/workflows/platform-smoke.yml` 作为本轮必需 gate

## Testing Strategy

### Task 1：help / usage / no-side-effect
使用纯本地 smoke，不依赖真实外部工具。

fixture：

- 所有 help smoke 都在 temp 目录下运行
- 统一设置 `HARNESS_LOCAL_ADAPTER=<temp>/local-adapter.json`
- 一组用例预置 local adapter fixture 文件并记录内容 hash 与 mtime
- 一组用例不预置 local adapter 文件，用于断言 help 不会创建它

断言矩阵：

- `install/update/upgrade/migrate/release-local --help` → exit `0`
- `install/update/upgrade/migrate/release-local -h` → exit `0`
- 每个命令输出包含稳定标题/usage
- `install --help` 后 `.bootstrap-ran` 不存在
- `release-local --help` 前后 `os.tmpdir()` 下 `enterprise-harness-release-local-*` 目录数量不增加
- 预置 local adapter fixture 时，`update/migrate --help` 前后文件内容 hash 与 mtime 不变
- 未预置 local adapter fixture 时，`update/migrate --help` 前后文件仍不存在
- `cli.mjs` 无 subcommand → exit `0` + usage
- `cli.mjs no-such-command` → exit `1` + `Unknown command:`

RED：当前 `install/update/upgrade/migrate` 至少一项不满足 help/no-side-effect 契约。

### Task 2：launcher / external-cwd / argv boundary
fixture 设计：

- 在系统 temp 下创建 `outside-cwd/`
- 使用绝对路径调用 `<repo>/harness/plugin/runtime/cli.mjs status`，当前实现会因为 `cwd=outside-cwd` 找不到 repo 内脚本或 contract 文件而失败
- PATH 前置一个假的 `npx` stub，记录收到的 argv 到 temp json 文件
- 从外部 cwd 调用 `<repo>/harness/plugin/runtime/context7.mjs docs "/react/react" "use effect examples"`
- 断言 stub 收到的最后一个参数仍是单个 `use effect examples`

RED：

- external-cwd 调 repo 内 `cli.mjs status` 失败
- 或 `context7.mjs` 下游 argv 观测不符合单参数边界

GREEN：

- external-cwd 调用成功打印 `Enterprise Harness Status`
- argv 观测文件显示 `['-y','ctx7','docs','/react/react','use effect examples']`

### Task 3：verify readiness separation + upstream-check mismatch
fixture 设计：

- 直接运行 `verify.mjs --json`，断言当前旧字段/文案不满足新 contract
- PATH 前置 `codegraph` / `npx` stub，分别返回受控版本字符串
- `upstream-check.mjs` 新增测试专用 `HARNESS_UPSTREAM_REGISTRY=<temp>/registry.json` 覆盖入口
- smoke 写入 temp registry fixture：一个 `runtime-upstream` 版本匹配，一个 `runtime-upstream` 版本 mismatch，`reference-upstream` 保持 `manual-review`
- docs assertions 采用精确字符串断言，不使用模糊“语义接近”验收

断言：

- `verify --json` 包含 `contractChecks` 与 `runtimeReadinessChecks`
- human 文案不再声称 `runtime checks passed`
- `runtimeReadinessChecks.status === 'not-run'`
- `runtimeReadinessChecks.guidance` 提到 `doctor --json` / `sync --json` / `upstream-check --json`
- `upstream-check --json` 在 mismatch 时 `result.ok === false`
- 对应 check 包含 `status=validated-version-mismatch`
- human output 明确打印 mismatch status
- `README.md` 必须包含 `verify 只声明 contract checks；runtime readiness 需另行运行 doctor / sync / upstream-check。`
- `harness/plugin/runtime/README.md` 必须包含 `runtime readiness 不由 verify 单独背书。`


## Risks

- 若把 `verify` 直接扩成再次执行 machine-local 命令，会让 contract 验证重新变得不稳定
- 若让 reference upstream 也自动 mismatch fail，会把人工观察型来源误当可机械比较对象
- 若 launcher contract 扩大到全局安装 wrapper，会超出本轮 issue 边界

## Rollout / Rollback

- rollout：先用三组 smoke 固定 help / launcher / readiness contract，再同步 README 与 change-level spec
- rollback：若 `upstream-check` mismatch fail 过于严格，可保留 `status` 字段与 human surface，同时把退出策略降回 warning；但 smoke 与 spec 不回退为模糊表述
