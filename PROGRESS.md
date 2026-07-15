# Progress

## 当前阶段

- 当前阶段：clarify-first staged orchestrator 已完成第一版 contract / template / worker / guidance / smoke 骨架（L3 clarify-first-staged-orchestrator）
- 进度定位：repo contract + portable runtime MVP 正在从 intake-first 骨架升级为 single-entry staged workflow core

## 最近完成

- 三层入口模型已成形：`/harness`、runtime CLI、hooks
- repo-facing `AGENTS.md` 已落地
- `release-local` 本地源外 smoke 路径已落地
- containerization / sandboxing 指南已落地
- reference-service 第一批 boundary realignment 已进入 `VALIDATED`

## 当前 active change

- 当前 active change：`clarify-first-staged-orchestrator`（当前处于 `DISCOVERED` / `workflow.stage=route`）
- 当前目标：继续把 `/harness` 从 contract-level stage orchestrator 推进到更强的运行时阶段映射与后续 design 收口

## 动态真相

- 动态真相优先级：`harness/ACTIVE_CHANGE` + `harness/changes/*/state.json`
- 本文件用途：人工维护的阶段快照与阅读入口，不替代动态状态真相

## 下一步重点

- 把 `/harness` 的 stage mapping 从 contract 推进到更细的运行时决策规则
- 继续深化 `workflow.*` 与 legacy state/approvals/validation 的协同表达
- 在 design / plan / tdd / verify 阶段逐步接入 exploration lane 的真实调度策略

## 推荐先读

1. `README.md`
2. `AGENTS.md`
3. `CLAUDE.md`
4. `harness/specs/staged-workflow.md`
5. `harness/specs/session-lifecycle.md`
6. `harness/changes/clarify-first-staged-orchestrator/`
