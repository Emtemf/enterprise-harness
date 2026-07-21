# Change

## 原始需求

基于对 pi 仓库的参考研究，继续推进剩余优化项，优先实现 source-external local release smoke path，并为后续 containerization / sandboxing guidance 留出 change 资产入口。

## 业务结果

让 Enterprise Harness 的发布/接入验证不只停留在“在源码仓库里运行命令”，而是增加一个从临时目录运行的 source-external smoke 路径，提升“portable runtime / installable”说法的可信度。

## 非目标

- 本轮不同时实现完整 containerization 文档
- 本轮不引入真正的 npm/registry 发布管线
- 本轮不重写 install / migrate / upgrade 机制

## 归属服务 / 模块 / 业务域

- scope: runtime productization
- module: `harness/plugin/runtime/`, `package.json`, `harness/specs/release-readiness.md`
- domain: release smoke / portable runtime validation

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: architecture_change, rule_change

## 最小探索证据

- 当前 prepublish / release readiness 已围绕 repo 内 `doctor` / `sync` / `verify` / `upstream-check`
- 当前缺少从 source-external 临时目录运行一轮 runtime smoke 的统一入口
- pi 的 `release:local` 模式给出了一个明确可借鉴方向：先在仓库外验证安装/运行路径，再谈正式发布

## 最终路由

- final tier: L3
- first implementation slice: issue #15（local source-external release smoke path）

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- source-external smoke 先以 runtime CLI 命令实现，而不是先做完整 package/release 系统
- 本地 smoke 中使用独立临时 `HARNESS_LOCAL_ADAPTER`，避免污染用户本机 adapter

## 假设

- 本机已有足够 runtime 依赖可运行 `doctor` / `sync` / `verify`
- `release-local` 在当前阶段主要验证 repo-external 运行路径，而不是 registry 安装

## Waiver

暂无。

## Requirement Review

该需求属于 runtime productization / release confidence 收紧，会改变 runtime command 面和 release readiness 语义，按 L3 路由合理。
