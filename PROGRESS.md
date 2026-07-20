# Progress

## 当前阶段

- 当前阶段：clarify-first staged orchestrator 第一版 contract / template / worker / guidance / workflow-state / smoke 骨架已完成验证收口（L3 clarify-first-staged-orchestrator）
- 进度定位：repo contract + portable runtime MVP 已完成 single-entry staged workflow core 的第一版骨架，当前进入 execution deepening 新阶段

## 最近完成

- 三层入口模型已成形：普通用户 `/harness`、维护层 runtime CLI、hooks
- 普通用户单入口 `/harness` 收口已完成，并已同步 GitHub description
- clarify-first staged orchestrator 第一版 contract / template / worker / guidance / workflow-state / smoke 骨架已进入 `VALIDATED`
- repo-facing `AGENTS.md` 已落地
- `release-local` 本地源外 smoke 路径已落地
- containerization / sandboxing 指南已落地
- reference-service 第一批 boundary realignment 已进入 `VALIDATED`

## 当前 active change

- 当前 active change：`orchestrator-execution-deepening`（当前处于 `DRAFT` / `workflow.stage=clarify`）
- 当前目标：在 clarify-first staged orchestrator 第一版骨架完成后，继续深化 workflow runner、runtime stage routing、automation-first progression 与 execution-phase guidance

## 动态真相

- 动态真相优先级：`harness/ACTIVE_CHANGE` + `harness/changes/*/state.json`
- 本文件用途：人工维护的阶段快照与阅读入口，不替代动态状态真相

## 下一步重点

- 按 `/harness-tdd` 或经 `/harness` 路由后进入执行阶段，验证 clarify-first 主线在真实实现中的可用性
- 继续深化 `workflow.*` 与 legacy state/approvals/validation 的协同表达
- 在 design / plan / tdd / verify 阶段逐步接入 exploration lane 的真实调度策略
- 结合 open issues #20 / #8 / #11 的意见，把 task 子状态、tier-specific artifact matrix 与 automation-first lifecycle runner 继续收口到运行时行为中
- 中期继续衔接 #9/#12（Java golden sample）与 #10/#13/#15（runtime/distribution productization）

## 推荐先读

1. `README.md`
2. `AGENTS.md`
3. `CLAUDE.md`
4. `harness/specs/staged-workflow.md`
5. `harness/specs/session-lifecycle.md`
6. `harness/changes/clarify-first-staged-orchestrator/`
