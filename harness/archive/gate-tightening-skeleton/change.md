# Change

## 原始需求

用户在对本项目做全局审视时发现：`harness/plugin/runtime/lib/gates.mjs` 的 `isGovernedTarget()` /
`requiredGateForTarget()` 硬编码只识别本仓库自带的 `reference-service/{src/main,src/test,openapi}` 路径。
`pre-write.mjs` 的机械门禁（`designApproved` / `RED verified` 拦截）因此只在本仓库自身生效——插件安装到任意
真实企业目标项目后，因为该项目通常不存在字面意义的 `reference-service/` 目录，`isGovernedTarget` 恒为
`null`，机械拦截从不触发，退化为纯 `SKILL.md` 文本提示（依赖模型自觉，恰是本项目设计哲学明确认为不可靠的方式）。
用户要求：修成能适配任意目标项目的受治理路径识别。

## 业务结果

`pre-write.mjs` 的机械门禁在真实安装到目标 Java 项目后也能生效：能自动识别该项目的 `src/main/java`、
`src/test/java`、OpenAPI 契约文件所在目录作为受治理路径，继续要求 `designApproved` / RED 证据才允许改动，
不再仅保护本仓库自带的 `reference-service` demo。`post-write.mjs` 在目标项目未完成 harness onboarding
（`isHarnessManaged=false`）时不再整体 no-op 掉结构/证据校验中与本次改动相关的部分。

## 非目标

- 不新增显式手动配置受治理路径的 schema 字段（本轮明确选择"自动探测 + 提醒不拦截"，不做手动 fallback 配置项）
- 不扩展到非 Java 技术栈的路径探测（本项目当前明确面向 Java 后端 / Spring Boot 场景）
- 不改变 `designApproved` / `redVerified` 的 gate 语义本身，只改变"哪些路径适用这些 gate"的识别方式
- 不改变 `reference-service` demo 自身的既有保护行为（须保持向后兼容）

## 归属服务 / 模块 / 业务域

- scope: enterprise harness governance / runtime gates
- owning module: `harness/plugin/runtime/lib/gates.mjs`、`harness/plugin/runtime/hooks/pre-write.mjs`、
  `harness/plugin/runtime/hooks/post-write.mjs`、`harness/plugin/runtime/lib/checks.mjs`
- business domain: workflow gates / mechanical enforcement for installed target projects

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: architecture_change, rule_change
- reason: 改变 runtime 门禁核心逻辑与"受治理路径"识别语义，属于平台规则/架构层变更，不是单文件局部调整

## 最小探索证据

见 `harness/changes/gate-tightening-skeleton/evidence/gates-exploration.md`：
- codegraph 确认 `isGovernedTarget`（`gates.mjs:17-24`）/ `requiredGateForTarget`（`gates.mjs:26-37`）硬编码
  `reference-service/{src/main,src/test,openapi}`，且两处调用点均无覆盖测试
- codegraph 确认 `post-write.mjs:10-12` 存在同根因的第二症状：`isHarnessManaged(root)=false` 时整体 no-op
- 确认当前 `local-adapter.example.json` / `templates/state.json` 均无"受治理路径"配置字段
- 交叉印证：历史 change `gate-hardening-semantics`（已 VALIDATED）的 `design.md` 已自行记录同一局限，
  但未在该轮收口

## 最终路由

- final tier: L3
- owning scope: `harness governance / runtime gates / installed target project enforcement`
- next focus: 进入 `design`，确定自动探测规则的具体实现方式与向后兼容策略

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策（clarify 已确认）

1. 受治理路径识别方式：**自动探测常见 Java 目录约定**（非显式手动配置）
2. 探测不到常见约定时：**提醒但不拦截**（不 BLOCK，输出诊断信息）
3. 范围：**本次一并修复** `post-write.mjs` 的 `isHarnessManaged` no-op 同类问题
4. 不做手动 fallback 配置项（本轮范围内明确排除）

## 假设

- 目标项目遵循 Maven/Gradle 标准 Java 目录约定（`src/main/java`、`src/test/java`）或至少可被启发式规则命中；
  非标准布局项目本轮通过"提醒不拦截"兜底，不视为本轮阻断条件
- `reference-service` demo 的现有目录结构（`src/main`、`src/test`、`openapi`）继续被新的自动探测规则覆盖，
  无需额外硬编码分支即可保持向后兼容

## Waiver

不适用。

## Requirement Review

待 `requirement-reviewer` 消费本 change 与 clarify 记录。
