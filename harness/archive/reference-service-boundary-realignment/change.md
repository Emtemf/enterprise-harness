# Change

## 原始需求

为 `reference-service` 做第一批黄金样板重构，让当前 cancel-order 纵切开始对齐企业 harness 的 Java 约束。

## 业务结果

把当前 reference service 从“目录分层演示样例”推进到“边界更正确、后续可继续强化的黄金样板起点”，为后续 MapStruct、ArchUnit、JaCoCo、API E2E 和 OpenAPI error contract 打基础。

## 非目标

- 本轮不新增业务能力
- 本轮不引入新表结构或 migration
- 本轮不一次性落地 ArchUnit / JaCoCo / 真实 HTTP API E2E
- 本轮不扩展 OpenAPI error contract，只显式记录当前缺口

## 归属服务 / 模块 / 业务域

- service: `reference-service`
- module/domain: `orders`
- slice: cancel-order

## 初步路由

- request shape: modify
- candidate tier: L2
- hard signals: architecture_change

## 最小探索证据

- codegraph 已用于确认 controller → application → domain → infrastructure 当前链路
- 当前关键问题：application 直接返回 interface DTO、直接依赖 infrastructure repository 包；repository port 位于 infrastructure；domain policy 带 Spring 注解
- OpenAPI 当前只覆盖 200 response，不覆盖 error path

## 最终路由

- final tier: L2
- owning scope: `reference-service/orders/cancel-order`
- focus: 边界与依赖方向修正，保留现有 HTTP 语义

## 影响矩阵

- API: yes（内部边界调整但 HTTP 语义维持）
- data: no（本轮不改表结构）
- architecture: yes
- rule: yes

## 需要确认的决策

- repository port 本轮先放 `domain.repository`
- MapStruct 本轮只先覆盖当前 cancel-order 纵切

## 假设

- 允许本轮先用 MockMvc integration test 保持行为不变，真实 HTTP API E2E 留到下一阶段
- 允许先维持当前异常行为，但在 design 中显式记录 OpenAPI error contract 缺口

## Waiver

暂无。

## Requirement Review

该需求属于 `reference-service` 单服务、单纵切高价值边界修正，规模仍可控，适合作为 L2 change 执行。
