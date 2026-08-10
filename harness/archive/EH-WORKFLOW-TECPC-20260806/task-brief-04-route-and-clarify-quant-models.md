# Task Brief

## Change ID
EH-WORKFLOW-TECPC-20260806

## Task ID
task-04-route-and-clarify-quant-models

## Goal
把 route 与 clarify 的量化模型收敛到严格机器合同：route 六维 schema，clarify interview evidence，与 phase-correct ownership 规则。

## Bootstrap Evidence Note
- 本任务的 route/clarify gate 设计应把 design/plan 审批视为已在 run-contract 层通过，而不是依赖旧 `reviews/*.json` schema 恰好可解析。
- 如果需要 review projection，只能消费 Task 1 规范化导入后的产物；raw copied review envelopes 仍视为 non-authoritative。
- 因此所有 checkpoint truth 都应追溯到 Task 1 导入链或原始 `runs/*/check.json`，而不是追溯到手工复制的 `reviews/*.json`。

## Touched Files
- `runtime/lib/router-score.mjs`
- `runtime/lib/ambiguity.mjs`
- `runtime/lib/stage-checkpoints.mjs`
- `runtime/lib/workflow.mjs`
- `runtime/test/route-score-six-dimension-smoke.mjs`
- `runtime/test/clarify-interview-evidence-smoke.mjs`
- `runtime/test/ambiguity-phase-boundary-smoke.mjs`
- `runtime/test/route-stage-separation-smoke.mjs`

## Consumes
- task 2 checkpoint stageData support
- task 3 probe and registry readiness for governed clarify/route entry
- current route/clarify logic in `runtime/lib/{router-score.mjs,ambiguity.mjs,workflow.mjs}`
- current route narrative in `harness/changes/EH-WORKFLOW-TECPC-20260806/change.md`

## Produces
- strict six-dimension route schema with total/tier/impact/threshold validation
- clarify interview evidence model for `information-gain`, `socratic`, `grill-me`, and `scope-confirmation`
- phase-correct scoring that allows design-owned and plan-owned open items when ownership is explicit
- route/clarify gates aligned to checkpoint truth rather than Markdown parsing shortcuts

## Dependency
- `task-03-codegraph-probe-and-registry`

## Test-first Order
1. RED: write `runtime/test/route-score-six-dimension-smoke.mjs`
2. Run `[
  "node",
  "runtime/test/route-score-six-dimension-smoke.mjs",
  "red"
]`
3. GREEN: implement minimal six-dimension route validation in `runtime/lib/router-score.mjs` and checkpoint persistence in `runtime/lib/stage-checkpoints.mjs`
4. Run `[
  "node",
  "runtime/test/route-score-six-dimension-smoke.mjs",
  "green"
]`
5. REFACTOR: run `[
  "node",
  "runtime/test/route-score-six-dimension-smoke.mjs",
  "verify"
]`
6. RED: write `runtime/test/clarify-interview-evidence-smoke.mjs`
7. Run `[
  "node",
  "runtime/test/clarify-interview-evidence-smoke.mjs",
  "red"
]`
8. GREEN: implement minimal clarify interview evidence persistence in `runtime/lib/{ambiguity.mjs,workflow.mjs}`
9. Run `[
  "node",
  "runtime/test/clarify-interview-evidence-smoke.mjs",
  "green"
]`
10. REFACTOR: run `[
  "node",
  "runtime/test/clarify-interview-evidence-smoke.mjs",
  "verify"
]`
11. RED: write `runtime/test/ambiguity-phase-boundary-smoke.mjs`
12. Run `[
  "node",
  "runtime/test/ambiguity-phase-boundary-smoke.mjs",
  "red"
]`
13. GREEN: implement minimal phase-boundary ownership rules in `runtime/lib/{ambiguity.mjs,workflow.mjs}`
14. Run `[
  "node",
  "runtime/test/ambiguity-phase-boundary-smoke.mjs",
  "green"
]`
15. REFACTOR: run `[
  "node",
  "runtime/test/ambiguity-phase-boundary-smoke.mjs",
  "verify"
]`
16. VERIFY: run `[
  "node",
  "runtime/test/route-stage-separation-smoke.mjs",
  "verify"
]`

## RED / GREEN / REFACTOR Evidence Expectations
- `route-score-six-dimension-smoke` RED proves the runtime still accepts five-dimension or inconsistent route truth.
- `clarify-interview-evidence-smoke` RED proves clarify can still pass without round-by-round interview evidence.
- `ambiguity-phase-boundary-smoke` RED proves design-owned or plan-owned details still incorrectly fail clarify.
- GREEN commands prove each behavior is fixed minimally and in dependency order.
- REFACTOR commands prove helper extraction does not reintroduce Markdown-driven truth or misplaced clarify burden.

## Acceptance Checks
- [ ] route truth is checkpoint stage data, not Markdown table parsing
- [ ] route enforces six dimensions, total, tier, impact, threshold rule, and evidence refs
- [ ] clarify checkpoint stores interview rounds, answer provenance, contradiction checks, information gain, next weakest reason, and scope confirmation
- [ ] route remains a separate stage and `route-stage-separation-smoke` still passes

## Expected Output
- task-id: `task-04-route-and-clarify-quant-models`
- status: `RED -> GREEN -> REFACTOR -> VERIFY`
- commands: exact argv frozen in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- evidence: route/clarify checkpoint stageData artifacts and route-stage separation regression evidence
- next-step: `task-05-audit-stop-skills-docs-packaging-regression`
