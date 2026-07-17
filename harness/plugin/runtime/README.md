# Portable Runtime Skeleton

## 目标

这里保存 Enterprise Harness 的跨平台运行层骨架。

当前阶段提供：

- `doctor.mjs`：最小自检入口
- `bootstrap.mjs`：最小初始化入口
- `manifest.json`：运行层声明
- field-level diagnostics：adapter problems 以结构化字段输出
- hard fail / warning：区分 machine-local adapter 的硬错误与可降级提示
- runtime readiness 不由 verify 单独背书。

## 原则

- 运行层优先跨平台实现
- 仓库契约与机器本地适配分离
- 本地 secrets 不进入仓库
