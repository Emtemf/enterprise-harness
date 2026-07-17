# Change

## 原始需求

从 issue #11（`[Gate hardening] Make design/plan/task gates explicit and enforceable`）开始，按当前仓库 workflow 继续推进，不停留在规划层；先做 intake 与 minimum discovery，必要时创建/更新 change 资产并设置 active change，再给出下一步 artifact / gate。

## 业务结果

把当前仓库的 gate hardening 主线，从“已有零散 gate 与 reviewer/schema 概念”推进到“可以继续实现的明确 L3 change 入口”。本轮先完成 intake、minimum discovery、change 资产落盘和 durable design/tasks 起点，为后续真正收紧 design / plan / task / RED / validation gate 语义做准备。

## 非目标

- 本轮不直接完成全部 gate hardening 实现
- 本轮不触碰 `reference-service` 业务逻辑
- 本轮不展开 Java 黄金样板增强或 runtime productization 主线
- 本轮不在没有 fresh reviewer / validation 证据前宣称 gate 已全面收紧完成

## 归属服务 / 模块 / 业务域

- scope: enterprise harness governance
- owning module: `.claude/rules/` + `harness/specs/` + `harness/plugin/runtime/`
- business domain: workflow gates / validation / reviewer consumption

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: architecture_change, rule_change, platform_rule_change
- reason: 该需求会改变 workflow gate 的语义与仓库治理路径，不属于单文件 L0/L1 调整

## 最小探索证据

- codegraph 已确认 `pre-write` 目前只在 governed path 上消费 `designApproved` 与 `redVerified`
- codegraph 已确认 `stop` 目前只阻止 `REVIEWED` / `VALIDATED` 但 `validation.status!=fresh` 的结束状态
- codegraph 已确认 `validateReviewVerdicts()` 当前只校验 reviewer verdict 文件结构，不消费 verdict 结果推进/阻断状态
- codegraph 已确认 `lifecycle.mjs` 目前有 `design-approved`、`red-verified`、`reviewed`、`validated` 等动作，但没有 plan gate / task gate 对应的显式动作
- 由此可判断：当前 gate 模型已部分存在，但 design / plan / task / reviewer verdict 的消费语义仍不完整

## 最终路由

- final tier: L3
- owning scope: `harness governance / runtime gates / review-verdict consumption`
- next focus: 先形成 durable design 与 tasks，把当前零散 gate 收敛成明确的设计与实现路径

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- plan gate 是否应成为独立 state/gate，还是先以 artifact presence + explicit state 组合表达
- task gate 是否以 `tasks.md` + task-level checklist 消费为主，还是新增 machine-readable task state
- reviewer verdict 应阻断哪些 state 迁移，哪些只做 advisory

## 假设

- 当前 issue #11 先作为 governance L3 change 处理，不强行与 Java sample 变更混在一个 issue 中
- 当前 codegraph 证据已足够支持进入 durable design
- 当前不需要额外 Context7 / vendor docs，因为问题主要是仓库内 gate 语义，不是外部库行为

## Waiver

暂无。

## Requirement Review

该需求属于仓库级 workflow / rule / architecture 治理收紧，会影响后续所有 change 的设计、tasking、validation 与 reviewer 使用方式，按 L3 路由是合理的。
