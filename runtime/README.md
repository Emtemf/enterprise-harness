# Hook Adapter and Workflow Primitives Skeleton

## 目标

这里保存 Enterprise Harness 的 Claude Code-only 运行层骨架。此处的“可移植”只指同一
Claude Code plugin 在不同操作系统上的机械 runtime，不包含其他 agent harness 适配。

当前阶段提供：

- `doctor.mjs`：最小自检入口
- `bootstrap.mjs`：最小初始化入口
- `manifest.json`：运行层声明
- field-level diagnostics：adapter problems 以结构化字段输出
- hard fail / warning：区分 machine-local adapter 的硬错误与可降级提示
- runtime readiness 不由 verify 单独背书。

## 原则

- 运行层优先保持 Linux、macOS、Windows 的操作系统可移植性
- agent 宿主只采用 Claude Code 的 hook、skill、agent 与 command 合同
- 仓库契约与机器本地适配分离
- 本地 secrets 不进入仓库
