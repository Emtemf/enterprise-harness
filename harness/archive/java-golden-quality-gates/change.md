# Change

## 原始需求

对应 issue #12：`[Java golden sample] Add ArchUnit and coverage gates to reference-service`。

目标是在不扩大 `reference-service` 业务范围的前提下，把它从“结构演示样例”推进为一个更像 reference quality profile 的机械质量样板，当前聚焦：

- ArchUnit 架构检查
- JaCoCo coverage measurement / check path
- 本地验证与后续 CI 接入位置说明

## 业务结果

为 `reference-service` 建立一条可重复执行的 Java 质量门禁路径，使本地 `mvn verify` 不再只是“测试跑过”，而是能同时消费：

- 架构边界约束
- 覆盖率测量/阈值
- 参考样板的质量声明

## 非目标

- 本轮不扩展新的业务纵切
- 本轮不把 `reference-service` 扩成产品级服务
- 本轮不在同一个 issue 中实现真实 HTTP E2E 与完整 OpenAPI parser gate
- 本轮不把 runtime / installer / distribution productization 混入实现

## 归属服务 / 模块 / 业务域

- scope: `reference-service`
- owning module: `reference-service/` + repo docs / validation assets
- business domain: Java reference quality profile / architecture gate / coverage gate

## 初步路由

- request shape: modify
- candidate tier: L2
- hard signals: architecture_change, quality_gate_change, build_contract_change
- reason: 涉及 Maven 构建质量门禁、架构边界机械校验与参考服务验证路径，不是文档-only 或局部实现修复

## 最小探索证据

- `reference-service/pom.xml` 当前没有 ArchUnit 依赖，也没有 JaCoCo plugin / check wiring
- 当前测试文件仅包含 unit / MockMvc integration / repository integration / 反射式 architecture test
- issue #12 与 #9 的 comment 都明确要求：先把本 issue 收窄为 ArchUnit + JaCoCo gate，而不是一次性扩成完整 golden sample
- Context7 已补到：
  - ArchUnit JUnit 5 `@AnalyzeClasses` / `@ArchTest` 用法
  - JaCoCo `jacoco:check` 在 Maven `verify` phase 的典型 rules 配置

## 最终路由

- final tier: L2
- owning scope: `reference-service quality gates`
- next focus: 先产出 durable design / tasks，再按 TDD 引入 ArchUnit 与 JaCoCo 最小可运行门禁

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- JaCoCo 第一版固定按 `BUNDLE + LINE + 85%` 执行，并排除 `ReferenceServiceApplication`、`config.*`、`*MapperImpl`
- ArchUnit 第一版只验证最关键依赖方向，并冻结 repository port / mapper 责任边界，不一次性引入更广对象命名规则
- 本 issue 只文档化 CI 接入位置，不在本轮直接改 GitHub Actions

## 假设

- issue #12 是 #9 的窄子集，先完成 ArchUnit / coverage gates 才是当前最小闭环
- 现有 `reference-service` 代码体量足够支持 85% 目标，但可能需要少量补测或 rule scope 调整
- 当前仍以 `mvn -f reference-service/pom.xml verify` 作为本 issue 的主要质量门禁命令

## Waiver

暂无。

## Requirement Review

该需求属于 `reference-service` 的 Java 质量门禁增强，会改变构建验证语义与 reference sample 的质量声明，但不扩展新的业务功能；按 L2 路由合理。
