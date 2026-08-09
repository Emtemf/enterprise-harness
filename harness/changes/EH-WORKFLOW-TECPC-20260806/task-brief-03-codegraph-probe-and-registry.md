# Task Brief

## Change ID
EH-WORKFLOW-TECPC-20260806

## Task ID
task-03-codegraph-probe-and-registry

## Goal
把 CodeGraph-first 提升为“当前 worktree 有效索引 + run/task 绑定 attempt + manifest parity probe”的硬合同，并统一 registry projection。

## Bootstrap Evidence Note
- 本任务不得直接消费 raw copied `reviews/design-reviewer.json` 或 `reviews/plan-critic.json` 作为审批事实。
- 可依赖的审批来源只有两类：Task 1 规范化后的 review projection，或原始权威 run-contract check 文件 `runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json` 与 `runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`。
- 因此本任务启动前，Task 1 bootstrap resolution 必须已完成。

## Touched Files
- `runtime/lib/governance-probe.mjs`
- `runtime/lib/codegraph-index.mjs`
- `runtime/hooks/pre-explore.mjs`
- `runtime/hooks/session-start.mjs`
- `runtime/lib/execution-prerequisites.mjs`
- `runtime/doctor.mjs`
- `.claude-plugin/plugin.json`
- `harness/behavior-checks.json`
- `harness/plugin/hooks-manifest.json`
- `harness/reviewers/catalog.json`
- `runtime/test/codegraph-index-identity-smoke.mjs`
- `runtime/test/codegraph-fallback-binding-smoke.mjs`
- `runtime/test/registry-conformance-probe-smoke.mjs`

## Consumes
- task 2 manifest + checkpoint engine
- current CodeGraph identity logic in `runtime/lib/codegraph-index.mjs`
- current fallback gate in `runtime/hooks/pre-explore.mjs`
- current registry projections in `.claude-plugin/plugin.json`, `harness/behavior-checks.json`, `harness/plugin/hooks-manifest.json`, and `harness/reviewers/catalog.json`

## Produces
- fatal wrong-worktree / unavailable / uninitialized CodeGraph identity detection
- run/task/behavior-bound CodeGraph attempt receipts and fallback gating
- boot/session probe for registry parity and CodeGraph identity
- manifest-aligned hook/behavior/reviewer/plugin projections

## Dependency
- `task-02-manifest-and-phase-checkpoints`

## Test-first Order
1. RED: write `runtime/test/codegraph-index-identity-smoke.mjs`
2. Run `[
  "node",
  "runtime/test/codegraph-index-identity-smoke.mjs",
  "red"
]`
3. GREEN: implement minimal current-worktree identity validation in `runtime/lib/codegraph-index.mjs`
4. Run `[
  "node",
  "runtime/test/codegraph-index-identity-smoke.mjs",
  "green"
]`
5. REFACTOR: run `[
  "node",
  "runtime/test/codegraph-index-identity-smoke.mjs",
  "verify"
]`
6. RED: write `runtime/test/codegraph-fallback-binding-smoke.mjs`
7. Run `[
  "node",
  "runtime/test/codegraph-fallback-binding-smoke.mjs",
  "red"
]`
8. GREEN: implement minimal attempt binding and fallback gate changes in `runtime/hooks/pre-explore.mjs` and `runtime/lib/execution-prerequisites.mjs`
9. Run `[
  "node",
  "runtime/test/codegraph-fallback-binding-smoke.mjs",
  "green"
]`
10. REFACTOR: run `[
  "node",
  "runtime/test/codegraph-fallback-binding-smoke.mjs",
  "verify"
]`
11. RED: write `runtime/test/registry-conformance-probe-smoke.mjs`
12. Run `[
  "node",
  "runtime/test/registry-conformance-probe-smoke.mjs",
  "red"
]`
13. GREEN: implement minimal probe/parity surface in `runtime/lib/governance-probe.mjs`, `runtime/hooks/session-start.mjs`, `runtime/doctor.mjs`, and registry projections
14. Run `[
  "node",
  "runtime/test/registry-conformance-probe-smoke.mjs",
  "green"
]`
15. REFACTOR: run `[
  "node",
  "runtime/test/registry-conformance-probe-smoke.mjs",
  "verify"
]`
16. VERIFY: run `[
  "node",
  "runtime/doctor.mjs",
  "--json"
]`

## RED / GREEN / REFACTOR Evidence Expectations
- `codegraph-index-identity-smoke` RED proves wrong-worktree or unhealthy indexes are still treated as usable.
- `codegraph-fallback-binding-smoke` RED proves fallback still works without a valid current run/task-bound attempt.
- `registry-conformance-probe-smoke` RED proves manifest/projection drift or fatal probe findings are not surfaced consistently.
- GREEN commands prove each behavior is fixed minimally before the next behavior.
- REFACTOR commands prove helper extraction does not re-allow weak fallback or registry drift.

## Acceptance Checks
- [ ] only `indexValidity=valid` real CodeGraph queries satisfy CodeGraph-first
- [ ] every counted CodeGraph attempt is bound to change/stage/behavior/run/task/agent/query/index validity/fallback reason
- [ ] session start and doctor expose manifest parity + CodeGraph identity findings
- [ ] plugin/hook/reviewer/behavior projections stay in parity with the manifest

## Expected Output
- task-id: `task-03-codegraph-probe-and-registry`
- status: `RED -> GREEN -> REFACTOR -> VERIFY`
- commands: exact argv frozen in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- evidence: codegraph-attempt receipts, probe artifacts, and manifest parity outputs
- next-step: `task-04-route-and-clarify-quant-models`
