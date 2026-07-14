# Change

## 原始需求

当前 harness 不能只在本机 Linux/bash 环境可用，还需要能在 Windows、macOS、Linux 和不同开发机之间作为“活的插件”接入与同步。

## 业务结果

把现有 repo-scoped harness 明确拆成：

- 项目共享契约层（repo contract）
- 机器本地运行层（portable runtime / local adapter）

并提供最小可运行的 runtime 命令：bootstrap、doctor、sync。

## 非目标

- 本轮不替换全部 `hooks/*.sh`
- 本轮不做完整 installer
- 本轮不处理真实 secrets 分发
- 本轮不把所有 repo 命令都迁成 Node runtime

## 归属服务 / 模块 / 业务域

- service: harness-governance
- module: portable runtime / plugin layer
- domain: enterprise harness runtime

## 初步路由

- request shape: new
- candidate tier: L2
- hard signals: platform_rule_change

## 最小探索证据

- 当前仓库已有 `.claude/` 自动加载层、templates、change 生命周期命令
- 当前运行层仍明显偏 bash-only / Linux-friendly
- 需要把 repo contract 与 machine-local adapter 分离

## 最终路由

- final tier: L2
- owning scope: `harness/plugin/runtime`
- focus: 跨平台运行骨架，而不是业务实现

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- runtime 先选 Node.js 作为跨平台执行层
- Context7 在当前阶段采用 CLI runtime path，而不是 project MCP

## 假设

- 团队机器默认可用 `node`
- repo 继续保留 shell 过渡实现，同时逐步引入跨平台 runtime

## Waiver

暂无。

## Requirement Review

该 change 属于企业 harness 运行层骨架，不依赖具体业务模块，适合作为通用插件层起点。
