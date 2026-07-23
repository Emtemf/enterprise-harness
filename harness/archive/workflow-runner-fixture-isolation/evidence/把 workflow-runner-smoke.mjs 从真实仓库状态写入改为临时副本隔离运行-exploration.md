# Exploration

## Topic

`workflow-runner-smoke.mjs` 直接在真实仓库根目录 (`repoRoot`) 上执行 `workflow.mjs run/resume/status`，并把
`test-runner-smoke` 目录与 `workflow-events.jsonl` 写进真实 `harness/changes/`，即使 finally 里有 cleanup，
仍属于“测试会改动真实仓库状态”的副作用，不符合当前仓库对 smoke 隔离性的目标。

## Date

2026-07-22

## Request Shape

modify（工程治理 / 测试隔离修复）

## Candidate Tier

L1（单文件局部修复，不影响 API/data/architecture/rule）

## Owning Module / Domain / Service

`harness/plugin/runtime/test/workflow-runner-smoke.mjs`

## Codegraph Attempt

- Status: direct Read 足够
- Queries: 直接读取 `workflow-runner-smoke.mjs` 全文
- Key Findings:
  - `repoRoot` 指向真实仓库根目录
  - `runWorkflow(repoRoot, ['run' ...])` / `resume` / `status` 都在真实仓库 cwd 上运行
  - `changeId = 'test-runner-smoke'` 固定写入真实 `harness/changes/test-runner-smoke`
  - `eventLogPath` 也直接指向真实仓库下的 `harness/changes/test-runner-smoke/evidence/workflow-events.jsonl`
  - `cleanup()` 只在退出时删除真实仓库里的 `harness/changes/test-runner-smoke/`，仍属于先污染后清理
- Fallback Reason: 无需 codegraph，单文件直读已足够

## Context7 / Documentation Attempt

- Library Name: 不适用
- Fallback Reason: 纯仓库内部测试隔离问题，不涉及外部库/SDK 行为

## Impact Summary

- API: no
- Data: no
- Architecture: no
- Rule: no

## Unknowns

- 是否仅改 `workflow-runner-smoke.mjs`，还是顺带把 workflow 相关其他 smoke 一并统一抽成 temp-repo helper
  （用户已明确选 1：先只修最危险的 `workflow-runner-smoke.mjs`）

## Decisions Required

- 已确认：本轮范围只收口 `workflow-runner-smoke.mjs`，不扩展到其他 workflow smoke

## Confidence

高。根因集中在一个文件，现状直接、无歧义，且与 `smoke-fixture-decoupling`/`red-task-fixture-decoupling`
 的修法模式高度类似：把真实仓库执行面切换到临时副本。