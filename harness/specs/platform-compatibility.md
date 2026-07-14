# 平台兼容说明

## 目标

明确当前 Enterprise Harness 在 Linux、macOS、Windows 三个平台上的支持级别、已验证能力与已知限制。

## 当前支持级别

### Linux
- 当前主要开发与验证平台
- repo contract、runtime CLI、doctor、sync、install skeleton、Node hook adapters 均已在 Linux 上真实运行

### macOS
- 设计上按 Node.js 跨平台入口兼容
- 尚未做真机验证
- 预期比 bash-only 方案更容易接入，但仍需实际 smoke test

### Windows
- 设计上按 Node.js 跨平台入口兼容
- 尚未做真机验证
- 当前已减少 runtime hook 对 bash 的依赖，但仓库中仍保留 shell 过渡实现，不应宣称“已全量验证”

## 当前已消除的主要风险

- 安装者已有统一 runtime CLI 入口，而不是散落 `.mjs` / `.sh`
- portable runtime 的核心命令已可通过 Node 直接执行
- runtime hook adapters 已开始用 Node 实现，不再完全依赖 bash

## 当前仍存在的限制

- `hooks/full-verify.sh` 仍是 shell 脚本
- `harness/bin/*.sh` 仍保留 shell 过渡实现
- Windows / macOS 尚缺真机 smoke test 记录
- 本地 secrets / env vars 仍由 machine-local adapter 管理，不自动分发

## 安装者最低要求

- Node.js >= 20
- `codegraph` 命令可用，且项目完成 `.codegraph/` 初始化
- `npx ctx7` 可用（当前阶段主路径是 CLI wrapper）
- 本地 adapter 已创建或可由 setup 命令创建

## 建议的真机验证顺序

### macOS / Windows 最小 smoke test
1. `node harness/plugin/runtime/cli.mjs bootstrap`
2. `node harness/plugin/runtime/cli.mjs setup-local-adapter --write`
3. `node harness/plugin/runtime/cli.mjs doctor`
4. `node harness/plugin/runtime/cli.mjs sync`
5. `node harness/plugin/runtime/cli.mjs upstream-check`
6. `bash hooks/full-verify.sh`（若本机具备 bash）或后续 Node 版 full verify

## 结论

当前版本已经具备跨平台插件骨架，但公开承诺仍应表述为：

> Linux 已实测；macOS / Windows 设计已兼容，待真机验证。
