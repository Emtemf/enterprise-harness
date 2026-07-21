# Progress

> 快照更新时间：2026-07-21。本文件是人工维护的阶段快照与阅读入口，
> **不替代动态状态真相**（动态真相以 `harness/ACTIVE_CHANGE` + `harness/changes/*/state.json` 为准）。

## 当前阶段

- clarify-first staged orchestrator 主线（骨架 + 执行深化）两批工作均已收口到 `VALIDATED`。
- 当前无"在途"（非 VALIDATED）开发中变更；处于两批 orchestrator 工作完成后的间歇期，等待下一轮选题。

## 健康快照（2026-07-21 实测）

- `cli.mjs verify`：contract checks 通过
- `cli.mjs doctor`：16 项 OK（必需文件齐全、node v22.22.1、codegraph 已建索引 115 文件 / 1882 节点 / 3046 边）
- runtime smoke（`harness/plugin/runtime/test/*smoke*.mjs`，共 49 个，`verify` 模式）：全绿
  - 注意：这些是 `red|green|verify` 三态 TDD 脚本，无参直接运行会打印 Usage 并退出（不是失败）
  - 已知坑：部分 `workflow-*-smoke` 会写真实仓库的 active change 状态，跑完需 `git checkout -- harness/changes/` 复位

## 最近完成

- 三层入口模型已成形：普通用户 `/harness`、维护层 runtime CLI、hooks
- 普通用户单入口 `/harness` 收口已完成，并已同步 GitHub description
- clarify-first staged orchestrator 第一版骨架（contract / template / worker / guidance / workflow-state / smoke）已 `VALIDATED`
- orchestrator 执行深化（`orchestrator-execution-deepening`，L3）已 `VALIDATED`
- repo-facing `AGENTS.md` 已落地；`release-local` 本地源外 smoke 路径已落地；containerization / sandboxing 指南已落地
- reference-service 第一批 boundary realignment 已 `VALIDATED`
- **归档清理（2026-07-21）**：4 个已完成变更移入 `harness/archive/`：
  `java-golden-real-http-openapi`、`runtime-adapter-diagnostics-hardening`、
  `runtime-installability-polish`、`runtime-productization-polish`

## 当前 active change

- 运行时权威 active 指针（`harness/ACTIVE_CHANGE`，本地 gitignored）：`clarify-first-staged-orchestrator`
- 状态：`VALIDATED` / `workflow.stage=verify`；其执行深化 `orchestrator-execution-deepening` 同为 `VALIDATED`
- 含义：orchestrator 主线已收口，指针停在最后触达的变更上，并非有未完成实现

## 变更清单（changes/，post-archive）

- `VALIDATED`：clarify-first-staged-orchestrator、orchestrator-execution-deepening、
  java-golden-quality-gates、gate-hardening-semantics、intake-smoke-demo、
  phase0-claude-governance-skeleton、plugin-runtime-skeleton、
  reference-service-boundary-realignment、session-lifecycle-progress、add-enterprise-harness-mvp
- 未推完（候选下一步）：
  - `SPECIFIED`：pi-containerization-guidance、pi-inspired-improvements、pi-runtime-followups
  - `DISCOVERED`：gate-tightening-skeleton
- 已归档（`harness/archive/`）：draft-gate-demo、release-local-source-external-smoke、
  java-golden-real-http-openapi、runtime-adapter-diagnostics-hardening、
  runtime-installability-polish、runtime-productization-polish

## 动态真相

- 动态真相优先级：`harness/ACTIVE_CHANGE` + `harness/changes/*/state.json`
- 本文件用途：人工维护的阶段快照与阅读入口，不替代动态状态真相

## 下一步重点

- 从三个 `SPECIFIED` 的 `pi-*` 变更与 `DISCOVERED` 的 `gate-tightening-skeleton` 中选定下一轮选题，经 `/harness` 路由推进
- 继续深化 `workflow.*` 与 legacy state/approvals/validation 的协同表达
- 在 design / plan / tdd / verify 阶段逐步接入 exploration lane 的真实调度策略
- 结合 open issues #20 / #8 / #11，把 task 子状态、tier-specific artifact matrix 与 automation-first lifecycle runner 继续收口到运行时行为
- 中期继续衔接 #9/#12（Java golden sample）与 #10/#13/#15（runtime/distribution productization）
- 技术债：修复 `workflow-*-smoke` 会写真实仓库 active change 状态的副作用（应在临时副本中运行）

## 推荐先读

1. `README.md`
2. `AGENTS.md`
3. `CLAUDE.md`
4. `harness/specs/staged-workflow.md`
5. `harness/specs/session-lifecycle.md`
6. `harness/changes/clarify-first-staged-orchestrator/`
