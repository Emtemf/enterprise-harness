# Task Brief

## Change ID
EH-WORKFLOW-TECPC-20260806

## Task ID
task-05-audit-stop-skills-docs-packaging-regression

## Goal
统一 current-stage-aware audit/Stop 语义，并把 schema 5 authority、skills/spec docs、packaging allowlist 与最终回归一起收口。

## Bootstrap Evidence Note
- `workflow audit` / `workflow status --json` / `Stop` 的最终 authority 必须能区分两类来源：权威 `runs/*/check.json` 审批事实，以及 Task 1 规范化后的 legacy review projection。
- raw copied `reviews/design-reviewer.json` 与 `reviews/plan-critic.json` 不能被这里的 audit 或 packaging contract 当作已验证 reviewer schema。
- 因此本任务只消费 Task 1 之后的 imported/normalized review evidence 或其原始 run-contract 来源。

## Touched Files
- `runtime/lib/workflow-audit.mjs`
- `runtime/hooks/stop.mjs`
- `runtime/cli.mjs`
- `package.json`
- `harness/specs/architecture.md`
- `harness/specs/workflow.md`
- `harness/specs/agents-and-handoff.md`
- `harness/specs/evidence.md`
- `harness/specs/state-schema.md`
- `harness/specs/ambiguity-scoring.md`
- `harness/specs/stage-observability.md`
- `.claude/skills/harness/SKILL.md`
- `.claude/skills/harness-design/SKILL.md`
- `.claude/skills/harness-plan/SKILL.md`
- `.claude/skills/harness-verify/SKILL.md`
- `runtime/test/workflow-audit-current-stage-smoke.mjs`
- `runtime/test/stop-audit-block-smoke.mjs`
- `runtime/test/workflow-audit-smoke.mjs`
- `runtime/test/task4-release-acceptance-smoke.mjs`
- `test/external-project/maven-lifecycle-e2e.mjs`

## Consumes
- tasks 1-4 runtime contracts, projections, probes, checkpoints, and route/clarify models
- current audit/stop behavior in `runtime/lib/workflow-audit.mjs` and `runtime/hooks/stop.mjs`
- packaging surface in `package.json`
- long-lived docs in `harness/specs/**` and `.claude/skills/**`

## Produces
- shared current-stage-aware audit engine used by `workflow audit`, `workflow status --json`, and `Stop`
- projection-only `last-audit.json` / `last-stop-check.json` semantics
- updated specs and stage skill docs for schema 5 authority and recovery model
- packaging allowlist/regression coverage for `harness/governance/**` inclusion and forbidden evidence exclusion
- final repo-level regression commands including prepublish and external-project acceptance

## Dependency
- `task-04-route-and-clarify-quant-models`

## Test-first Order
1. RED: write `runtime/test/workflow-audit-current-stage-smoke.mjs`
2. Run `[
  "node",
  "runtime/test/workflow-audit-current-stage-smoke.mjs",
  "red"
]`
3. GREEN: implement minimal shared current-stage audit engine in `runtime/lib/workflow-audit.mjs` and `runtime/cli.mjs`
4. Run `[
  "node",
  "runtime/test/workflow-audit-current-stage-smoke.mjs",
  "green"
]`
5. REFACTOR: run `[
  "node",
  "runtime/test/workflow-audit-current-stage-smoke.mjs",
  "verify"
]`
6. RED: write `runtime/test/stop-audit-block-smoke.mjs`
7. Run `[
  "node",
  "runtime/test/stop-audit-block-smoke.mjs",
  "red"
]`
8. GREEN: wire `runtime/hooks/stop.mjs` to the shared blocker engine
9. Run `[
  "node",
  "runtime/test/stop-audit-block-smoke.mjs",
  "green"
]`
10. REFACTOR: run `[
  "node",
  "runtime/test/stop-audit-block-smoke.mjs",
  "verify"
]`
11. RED: extend `runtime/test/task4-release-acceptance-smoke.mjs`
12. Run `[
  "node",
  "runtime/test/task4-release-acceptance-smoke.mjs",
  "red"
]`
13. GREEN: update `package.json`, `harness/specs/**`, and `.claude/skills/**`
14. Run `[
  "node",
  "runtime/test/task4-release-acceptance-smoke.mjs",
  "green"
]`
15. REFACTOR: run `[
  "node",
  "runtime/test/task4-release-acceptance-smoke.mjs",
  "verify"
]`
16. VERIFY: run `[
  "node",
  "runtime/test/workflow-audit-smoke.mjs",
  "verify"
]`
17. ACCEPTANCE: run `[
  "node",
  "runtime/prepublish.mjs"
]`
18. ACCEPTANCE: run `[
  "node",
  "test/external-project/maven-lifecycle-e2e.mjs"
]`

## RED / GREEN / REFACTOR Evidence Expectations
- `workflow-audit-current-stage-smoke` RED proves current-stage blockers are still omitted from default audit/status.
- `stop-audit-block-smoke` RED proves Stop still fails to block on stale validation, fatal probe, missing checker, or digest mismatch.
- `task4-release-acceptance-smoke` RED proves docs/packaging still omit required governance assets or include forbidden evidence paths.
- GREEN commands prove each behavior is fixed minimally before the next behavior.
- REFACTOR commands prove cleanup does not reintroduce divergent blocker semantics or packaging drift.

## Acceptance Checks
- [ ] `workflow audit`, `workflow status --json`, and `Stop` share one current-stage-aware blocker engine
- [ ] `last-audit.json` and `last-stop-check.json` are projection-only and never replace recomputation
- [ ] shipped package includes `harness/governance/**` plus required specs/skills and excludes forbidden `harness/changes/**` / `harness/archive/**` evidence paths
- [ ] repo-level regression includes both `runtime/prepublish.mjs` and `test/external-project/maven-lifecycle-e2e.mjs` before handoff to verify

## Expected Output
- task-id: `task-05-audit-stop-skills-docs-packaging-regression`
- status: `RED -> GREEN -> REFACTOR -> VERIFY -> ACCEPTANCE`
- commands: exact argv frozen in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- evidence: audit/stop projections, packaging acceptance evidence, and repo-level regression outputs
- next-step: verify-stage handoff / independent `verification-reviewer`
