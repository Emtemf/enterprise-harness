# Design

## Requirement Alignment

本 change 的目标是参考 pi 的 `release:local` 思路，为 Enterprise Harness 增加一个 source-external 的本地 release smoke 路径。

核心不是做真正发布，而是验证：

1. 把仓库复制到临时目录后是否还能作为独立 repo 运行
2. runtime CLI 在源码树外是否仍能完成最小接入与自检
3. 本机 local adapter 是否能通过临时路径隔离，避免污染用户真实配置

## Current-State Evidence

当前仓库已具备：

- `doctor`
- `sync`
- `verify`
- `upstream-check`
- `prepublish-check`

但这些都更偏向在当前源码仓库内运行。当前缺少一个明确命令，用于：

- 复制 repo 到临时目录
- 使用独立 `HARNESS_LOCAL_ADAPTER`
- 从临时目录执行 bootstrap / setup / doctor / sync / verify / upstream-check

## Options Considered

### Option A：直接做完整 npm/package 发布 smoke

### Option B：先做 repo-external 本地 smoke，再把 package/registry 级验证留到后续 issue

## Selected Option and Rationale

选择 **Option B**。

理由：

- 风险更低
- 当前仓库仍未把 registry/package 分发作为默认主路径
- repo-external smoke 已能显著提升“portable runtime”说法的可信度

## Rejected Options

拒绝一步到位做完整 package publish smoke，因为那会把 registry/package 策略、打包、安装、发布凭据等问题一起耦合进当前 change。

## Affected Layers

- runtime CLI：新增 `release-local`
- package scripts：新增 `release-local`
- runtime manifest：新增 `releaseLocal`
- release docs/spec：同步当前已具备能力

## Cross-layer Type and Mapper Matrix

不适用。

## Repository Port Design

不适用。

## API Contract

不适用。

## Data Design

不涉及业务数据。会引入一个临时目录中的本地 adapter 文件，以避免污染用户真实 `HARNESS_LOCAL_ADAPTER`。

## Error Handling

若临时目录 smoke 中任一步失败：

- 直接退出并返回失败状态
- 保持失败输出可见
- 不清空失败原因
- 若使用 `--keep-temp`，允许保留临时目录用于排查

## Transaction Boundaries

不适用。

## Testing Strategy

至少验证：

1. `node harness/plugin/runtime/cli.mjs release-local` 可运行
2. 它会使用临时 repo 与临时 local adapter
3. `bootstrap` / `setup-local-adapter` / `doctor --json` / `sync --json` / `verify` / `upstream-check --json` 都在临时 repo 内完成

## Rollout and Rollback

- rollout：先引入 `release-local` 命令与文档/spec 更新
- rollback：若命令设计不稳，可移除命令入口，但保留 issue 与 change 资产

## Risks

- 复制整个仓库到临时目录可能比直接运行更慢
- 若未来 repo 体积增长，source-external smoke 的时间成本会上升
- 若某些命令隐式依赖当前源码树之外状态，可能暴露新的环境耦合问题

## Open Questions

1. 后续是否要把 `release-local` 纳入 `prepublish-check` 或正式 release 流程？
2. 是否要在后续 issue 中补 registry/package 安装 smoke？
3. `--keep-temp` 是否足够，还是还需要 `--out <dir>` 这类更强控制？

## Design Self-Review

- requirement coverage：已覆盖 issue #15 的最小目标
- scope control：不与 registry/package 发布策略耦合
- testability：可通过 `release-local` 命令直接验证
- risk balance：先实现低风险 source-external smoke，再扩展更重的发布路径

## Approval

当前设计已具备进入实现的最小条件。
