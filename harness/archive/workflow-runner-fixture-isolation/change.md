# Change

## 原始需求

用户认可“`workflow-*-smoke` 会写真实仓库 active change 状态的副作用”是当前最高优先级的剩余工程治理问题，并明确选择先只修最危险的 `workflow-runner-smoke.mjs`，不一次性扩展到全部 workflow smoke。

## 业务结果

`harness/plugin/runtime/test/workflow-runner-smoke.mjs` 不再在真实仓库根目录上执行 `workflow.mjs run/resume/status`，也不再把 `test-runner-smoke` 与 `workflow-events.jsonl` 写进真实 `harness/changes/`。改为复制整仓到临时副本，在副本内运行全部 workflow 命令、读取 event log、做断言，并在副本级清理。修复后该 smoke 不会再污染真实仓库的 `harness/changes/`/`ACTIVE_CHANGE` 动态真相。

## 非目标

- 不修改其他 workflow 相关 smoke（`workflow-decision-smoke.mjs` / `workflow-progression-decision-smoke.mjs` /
  `workflow-execution-status-smoke.mjs` 等）
- 不抽象公共 temp-repo helper（本轮先做最小修复，避免范围膨胀）
- 不修改 `workflow.mjs` 本身的业务语义

## 归属服务 / 模块 / 业务域

- scope: harness runtime test 自身的 fixture/隔离方式
- owning module: `harness/plugin/runtime/test/workflow-runner-smoke.mjs`
- business domain: 测试基础设施 / runtime governance 自检

## 初步路由

- request shape: modify
- candidate tier: L1
- hard signals: 无（单文件测试隔离修复）
- reason: 与 `smoke-fixture-decoupling` / `red-task-fixture-decoupling` 同类，都是把真实仓库执行面替换为临时副本执行

## 最小探索证据

见 `evidence/把 workflow-runner-smoke.mjs 从真实仓库状态写入改为临时副本隔离运行-exploration.md`：
- `repoRoot` 是真实仓库根
- `runWorkflow(repoRoot, ...)` 在真实仓库 cwd 上执行 `workflow.mjs`
- `changeId = 'test-runner-smoke'` 与 `eventLogPath` 都直接落在真实 `harness/changes/` 下
- `cleanup()` 虽会删除真实目录，但本质仍是“先污染再清理”

## 最终路由

- final tier: L1
- owning scope: `harness/plugin/runtime/test/workflow-runner-smoke.mjs`
- next focus: design 阶段明确 temp-repo 隔离方案与验收证据

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: no

## 需要确认的决策

- 已确认：本轮只修 `workflow-runner-smoke.mjs`，不扩大到其他 workflow smoke

## 假设

- `workflow-runner-smoke.mjs` 复制整仓到临时副本后，`workflow.mjs run/resume/status` 在该副本内的行为与真实仓库一致，
  不依赖外部全局状态

## Waiver

不适用。

## Requirement Review

待 reviewer 消费。
