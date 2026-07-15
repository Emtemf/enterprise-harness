# Change

## 原始需求

基于对 pi 仓库的参考研究，补齐 Enterprise Harness 的 containerization / sandboxing 指南，把这类运行时隔离策略从隐含知识变成稳定文档入口。

## 业务结果

让仓库对外能明确说明：

- 默认运行模型是什么
- 容器化/沙箱化适合什么场景
- local adapter、secrets、governed writes 在隔离环境里怎么处理

## 非目标

- 本轮不实现真正的 sandbox runtime
- 本轮不提供 Docker image / compose / Kubernetes 清单
- 本轮不改变 hooks/gates 的核心行为

## 归属服务 / 模块 / 业务域

- scope: runtime productization / documentation
- module: `harness/specs/`, `README.md`, `CONTRIBUTING.md`, `harness/plugin/runtime/lib/checks.mjs`
- domain: containerization / sandboxing guidance

## 初步路由

- request shape: modify
- candidate tier: L2
- hard signals: rule_change

## 最小探索证据

- pi 提供了稳定的 containerization / sandboxing 文档
- 当前 Enterprise Harness 已讲清 local adapter 与 portable runtime，但未提供独立的容器化模式说明
- 当前最合适的第一步是文档/contract 层补齐，而不是直接实现沙箱 runtime

## 最终路由

- final tier: L2
- first implementation slice: issue #16（新增 containerization / sandboxing 指南）

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: yes

## 需要确认的决策

- 先新增 stable spec，而不是 runtime 实现
- 默认运行模型仍然是本机进程，不把容器化表述成默认要求

## 假设

- 当前文档级实现足以关闭 issue #16
- 后续如要实现真正 sandbox runtime，应另开新 issue / change

## Waiver

暂无。

## Requirement Review

该需求主要是 runtime/documentation contract 补齐，不涉及业务代码或架构重构，按 L2 路由合理。
