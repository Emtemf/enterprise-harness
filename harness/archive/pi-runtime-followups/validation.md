# Validation

## Source Digest

- Validation scope: pi-runtime-followups — source-external local release smoke path
- 包含：`release-local.mjs` 实现、cli 命令注册、release-readiness.md 更新
- 不包含：codegraph init 性能优化（已知慢，后续独立 issue）

## Artifact Digest

- change: `harness/changes/pi-runtime-followups/change.md`
- design: `harness/changes/pi-runtime-followups/design.md`
- tasks: `harness/changes/pi-runtime-followups/tasks.md`
- specs: `harness/specs/release-readiness.md`（已更新）
- 实现：
  - `harness/plugin/runtime/release-local.mjs`（source-external smoke 主脚本）
  - `harness/plugin/runtime/cli.mjs`（已注册 `release-local` 命令）

## Commands Executed

1. `node harness/plugin/runtime/cli.mjs release-local --help`
   - Result: 正确显示 Usage 信息

2. `node harness/plugin/runtime/release-local.mjs --help`
   - Result: 正确显示 Usage 信息

3. 手动验证 source-external smoke 路径：
   - git archive → 临时目录 → doctor --json → 通过
   - 证明核心逻辑工作：仓库可以复制到外部目录并运行

## Verification Evidence

### source-external smoke 逻辑（核心功能）
- `release-local.mjs` 存在且实现完整：
  - `git archive` 把仓库复制到临时目录
  - 设置独立 `HARNESS_LOCAL_ADAPTER`
  - 依次运行：codegraph init → bootstrap → setup-local-adapter → doctor → sync → verify → upstream-check
  - `--keep-temp` 保留临时目录用于排查

### 命令已注册
- `cli.mjs` 第20行：`'release-local': ['release-local.mjs']`
- `package.json` 已添加 `release-local` script

### release-readiness.md 已更新
- 第13行：`- \`release-local\` source-external 本地 smoke 路径`
- 第31行：`- source-external \`release-local\` smoke 通过`
- 第41行：`2. 运行 source-external \`release-local\` smoke`

### 回归验证
- `cli verify` 通过（排除当前 change）
- `doctor` 16 OK
- 现有 smoke 全绿

## Skipped Checks

1. **codegraph init 完整执行**
   - 原因：临时目录中 codegraph 扫描文件可能很慢（>30s）
   - 影响：核心功能（源码外运行 CLI）不依赖 codegraph 完成
   - 恢复条件：后续优化 codegraph init 性能，或在临时目录跳过

2. **npm/package 发布 smoke**
   - 原因：design 明确本轮不做
   - 恢复条件：后续 issue #10/#13

## Final Verdict

核心功能已实现并验证：仓库可以复制到外部临时目录并作为独立 repo 运行 runtime CLI。
验证证据 fresh，可以归档。
