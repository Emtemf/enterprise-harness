# Runtime Contract

## Scope

本 spec 固定 repo-level runtime façade 的长期稳定契约，用于承接 `runtime-productization-polish` 本轮冻结结果。

## 1. CLI / launcher contract

### Supported entry shape

- `node <repo>/harness/plugin/runtime/cli.mjs <command> [args]`

### Required behavior

- 允许从 repo 外部 cwd 调用 repo 内绝对路径 entry
- repo root 必须由 entry 自身位置推导，不能依赖调用时 cwd
- `node .../cli.mjs`：exit `0`，stdout 包含 `Enterprise Harness Runtime CLI`
- `node .../cli.mjs <unknown>`：exit `1`，stderr 包含 `Unknown command:`

## 2. Help / usage / no-side-effect contract

### Covered entries

- `install.mjs`
- `update.mjs`
- `upgrade.mjs`
- `migrate.mjs`
- `release-local.mjs`
- `cli.mjs`

### Required behavior

- `--help` 与 `-h`：exit `0`
- help 输出第一行必须为稳定标题或 usage
- help 不得触发真实动作

### Observable no-side-effect criteria

- `.bootstrap-ran` marker 判据采用前后状态不变：
  - 若前置存在，则 help 前后内容 hash 与 mtime 不变
  - 若前置不存在，则 help 前后仍不存在
- 不创建 `enterprise-harness-release-local-*` temp 目录
- local adapter 判据固定 `HARNESS_LOCAL_ADAPTER=<temp>/local-adapter.json`
  - 预置 fixture 时：help 前后文件仍存在、内容 hash 不变、mtime 不变
  - 非预置 fixture 时：help 前后文件仍不存在
- 不执行 bootstrap / setup-local-adapter / sync / doctor / verify / upstream-check

## 3. Verify contract vs runtime readiness

### Command surface

- 保留 `node harness/plugin/runtime/cli.mjs verify`
- 本轮不拆 `verify-contract` / `verify-readiness`

### JSON contract

`verify --json` 顶层必须包含：

- `ok`
- `contractChecks`
- `runtimeReadinessChecks`

`contractChecks` 必须包含：

- `ok`
- `problems`
- `todoHits`

`runtimeReadinessChecks` 必须包含：

- `ok`
- `status`
- `guidance`

当前阶段固定：

- `runtimeReadinessChecks.status = "not-run"`
- `runtimeReadinessChecks.guidance` 至少包含：
  - `doctor --json`
  - `sync --json`
  - `upstream-check --json`

### Human output

- 不得再输出 `OK contract and runtime checks passed.`
- 必须明确区分：contract checks 已通过；runtime readiness 需另行判断

## 4. Upstream-check validated version mismatch

### Fixture injection

- smoke 通过 `HARNESS_UPSTREAM_REGISTRY=<temp>/registry.json` 注入测试专用 registry fixture

### runtime-upstream

- 命令不可执行 → `ok=false`，exit `1`
- 命令可执行且 `currentVersion === expectedVersion` → `ok=true`，`status=validated-version-match`
- 命令可执行但 `currentVersion !== expectedVersion` → `ok=false`，`status=validated-version-mismatch`，exit `1`

### reference-upstream

- `expectedVersion=manual-review`
- 不参与自动 mismatch fail

### Required per-check fields

- `name`
- `kind`
- `ok`
- `status`
- `currentVersion`
- `expectedVersion`

### Human output

mismatch 必须显式打印：

- `status=validated-version-mismatch`
- `current=... expected=...`

## 5. Context7 argv boundary

### Required behavior

- `context7.mjs` 必须以 argv array 方式向下游传参
- 多词 query 必须以单参数边界传给下游

### Deterministic test oracle

stub `npx` 观测到的 argv 必须等于：

```json
["-y","ctx7","docs","/react/react","use effect examples"]
```

## 6. Docs oracle

文档验收固定使用精确字符串：

- `README.md` 必须包含：`verify 只声明 contract checks；runtime readiness 需另行运行 doctor / sync / upstream-check。`
- `harness/plugin/runtime/README.md` 必须包含：`runtime readiness 不由 verify 单独背书。`
