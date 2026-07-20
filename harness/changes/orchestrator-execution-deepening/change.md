# Change

## 原始需求

在 `clarify-first-staged-orchestrator` 第一版骨架已经完成后，继续把主线推进到更真实的执行期行为，而不是停留在骨架完成态。

## 业务结果

让 `/harness` 背后的 workflow runner 与状态消费更接近真实执行面：

- 普通用户继续只从 `/harness` 进入
- workflow runner 的 run / resume / status / decide 在真实 active change 上更稳定
- SessionStart / status / Stop 的下一步动作提示更少依赖人工解释
- automation-first progression 更接近真实交付流程

## 非目标

- 不重复做用户入口文案收口
- 不重复补第一版 staged orchestrator 骨架 contract/template
- 不扩展 Java / OpenAPI / business feature 范围
- 不展开公共 marketplace / distribution 路线

## 归属服务 / 模块 / 业务域

- scope: workflow runner execution deepening / automation-first progression
- owning module: `harness/plugin/runtime/*`, `.claude/skills/harness/SKILL.md`, related smoke, change assets
- business domain: staged orchestrator execution behavior / recovery guidance / state consumption

## 初步路由

- request shape: modify
- candidate tier: L3
- reason: 本轮继续修改 orchestrator / runtime / workflow state consumption / user guidance 主线，属于架构和规则层深化

## 最小探索证据

- `clarify-first-staged-orchestrator` 第一版骨架 smoke 已全部通过
- 当前 workflow runner 已具备最小 `run|resume|status|decide` 能力
- 当前主线真正缺口从“骨架 contract”转移到了“真实执行阶段行为深化”

## 最终路由

- final tier: L3
- owning scope: post-skeleton execution deepening for clarify-first orchestrator
- next focus: 先设计执行期 runner / guidance / state-consumption 深化，再进入新的 plan/TDD

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- 本轮是否把 workflow runner 的推进行为继续收进现有 `workflow.mjs`，而不是拆新 runner
- 本轮是否优先深化 `status/session-start/stop` 对 execution-phase 的提示，而不是扩更多新命令

## 假设

- 用户继续推进的核心诉求是“主线继续向真实执行阶段深化”，而不是停在骨架完成态

## Waiver

- 暂无。

## Requirement Review

当前需求属于 clarify-first staged orchestrator 主线的 execution deepening，保持在 runtime/workflow/skill contract 范围内，按 L3 路由合理。
