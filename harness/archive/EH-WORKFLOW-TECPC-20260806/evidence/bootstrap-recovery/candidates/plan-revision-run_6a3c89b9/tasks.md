# Tasks（Run-Contract Approved, Bootstrap Recovery Import Pending）

Status: approved-for-task-00-bootstrap-recovery-import

> 独立审批已经在 run/check 合同层成立：`harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json`（`design-reviewer`，`verdict=pass`）与 `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`（`plan-critic`，`verdict=pass`）。`reviews/design-reviewer.json` 与 `reviews/plan-critic.json` 目前只是从这些 check envelopes 直接复制出的 legacy review projection，且不符合 legacy `reviews/*.json` schema；在 Task 01 通过新的 verified importer 完成规范化导入前，它们不是权威审批源。TDD 必须先完成 Task 00 的窄范围、可审计 recovery importer，让隔离 executor 已获独立 checker 通过/建议通过的 bootstrap 计划产物能合法发布到权威 worktree；Task 01 依赖 Task 00 解开该 bootstrap deadlock 后再扩展到通用 importer / snapshot / state 原子性，Task 02-05 仍以 Task 01 完成该 generic import resolution 为前提。

## Plan Metadata
- change-id: `EH-WORKFLOW-TECPC-20260806`
- plan status: `approved-run-contract-bootstrap-recovery-import-pending`
- design approval (run contract): `pass` via `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json`
- plan critic approval (run contract): `pass` via `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`
- legacy review projection status:
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/design-reviewer.json`: copied check envelope, schema-mismatched, non-authoritative until Task 01 import
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/plan-critic.json`: copied check envelope, schema-mismatched, non-authoritative until Task 01 import
- tdd entry policy: `Task 00 may start now on run-contract approval; Task 01 requires Task 00 bootstrap recovery import; Task 02+ require Task 01 generic importer resolution`
- command policy: `harness/command-policy.json`
- command executable policy: `node` only
- repo root for every frozen argv: `.`
- path policy: all touched files / consumes / produces are repository-relative
- task dependency policy: strictly serial, preserve `task-00 -> task-01 -> task-02 -> task-03 -> task-04 -> task-05`

## Task 00: `task-00-bootstrap-v2-command-sequencing`

**Touched Files**
- Create:
  - `runtime/lib/bootstrap-recovery-import.mjs`
  - `runtime/test/bootstrap-recovery-import-smoke.mjs`
- Modify:
  - `runtime/evidence-import.mjs`
  - `runtime/cli.mjs`

**Consumes**
- `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- `harness/command-policy.json`
- `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json`
- `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`
- current artifact import / publish path in `runtime/evidence-import.mjs`
- current CLI import entrypoints in `runtime/cli.mjs`
- executor run output files for exactly these plan assets only:
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/tasks.md`
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/task-brief-00-bootstrap-v2-command-sequencing.md`

**Produces**
- one bootstrap-only recovery importer that can publish exactly the three Task 00 plan assets from an executor run output into the authoritative worktree
- source validation that requires a bound executor run plus an independent checker verdict of `pass` or `advisory`, and rejects `block`, non-parent bindings, or missing provenance
- SHA-256 verification for each declared source output file before publish
- whitelist + conflict guards that reject non-whitelisted target paths and reject any target that already contains different bytes
- temp-file + rename atomic publish semantics for each imported artifact
- one durable recovery receipt containing source run/check ids, per-file digests, target paths, checker verdict, and publish provenance
- focused bootstrap smoke coverage proving this importer is the narrow bridge that lets corrected Task 00 plan assets for the original v2 command sequencing / handoff-input deadlock reach the authority worktree without widening into a generic importer

**Depends on**
- None. This is the only new bootstrap capability allowed before generic import, snapshot continuity, or state atomicity work.

**Test-first Execution Order**
1. RED — write `runtime/test/bootstrap-recovery-import-smoke.mjs`; run `[
  "node",
  "runtime/test/bootstrap-recovery-import-smoke.mjs",
  "red"
]` to prove the current bootstrap path cannot legally import corrected Task 00 plan outputs from an executor run, and still leaves the original v2 `commands[]` sequencing / task-handoff-input fix stranded outside the authoritative worktree.
2. GREEN — implement `runtime/lib/bootstrap-recovery-import.mjs` and wire `runtime/evidence-import.mjs` plus `runtime/cli.mjs`; run `[
  "node",
  "runtime/test/bootstrap-recovery-import-smoke.mjs",
  "green"
]`.
3. REFACTOR — keep the importer bootstrap-only, preserve exact path whitelist and receipt durability, and rerun `[
  "node",
  "runtime/test/bootstrap-recovery-import-smoke.mjs",
  "verify"
]`.

**Acceptance Checks**
- [ ] bootstrap recovery import succeeds only when the source executor run is explicitly bound to an independent checker run whose verdict is `pass` or `advisory`
- [ ] bootstrap recovery import rejects checker `block`, missing/non-parent bindings, non-whitelisted target paths, SHA-256 mismatches, and targets whose existing contents differ from the imported bytes
- [ ] publish uses temp + rename atomicity and emits one durable recovery receipt containing run/check linkage, per-file digest evidence, target paths, and provenance
- [ ] Task 00 remains bootstrap-scoped: it imports only `tasks.md`, `task-commands.json`, and `task-brief-00-bootstrap-v2-command-sequencing.md`, and does not widen into the generic artifact importer reserved for Task 01
- [ ] the imported `task-commands.json` / task brief content is the bridge that unblocks the previously stranded v2 command sequencing and task-handoff-input corrections, without changing any later task argv beyond those already frozen in the recovered source output

## Task 01: `task-01-snapshot-import-state-atomicity`

**Touched Files**
- Create:
  - `runtime/lib/artifact-import.mjs`
  - `runtime/lib/worktree-snapshot.mjs`
  - `runtime/lib/state-projection-store.mjs`
  - `runtime/test/artifact-import-contract-smoke.mjs`
  - `runtime/test/worktree-snapshot-import-smoke.mjs`
  - `runtime/test/state-projection-atomicity-smoke.mjs`
- Modify:
  - `runtime/evidence-import.mjs`
  - `runtime/hooks/worktree-create.mjs`
  - `runtime/cli.mjs`
- Reuse/Test:
  - `runtime/test/tdd-receipt-contract-smoke.mjs`

**Consumes**
- Task 00 bootstrap recovery importer for plan-asset publication into the authoritative worktree
- `harness/changes/EH-WORKFLOW-TECPC-20260806/design.md`
- `harness/command-policy.json`
- authoritative checker run contracts in `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json` and `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`
- copied legacy review projections in `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/design-reviewer.json` and `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/plan-critic.json`
- current spool/import behavior in `runtime/evidence-import.mjs`
- current child-worktree continuity behavior in `runtime/hooks/worktree-create.mjs`
- current receipt guardrail behavior in `runtime/test/tdd-receipt-contract-smoke.mjs`

**Produces**
- one durable worker artifact importer for spool-backed artifacts (`tdd-receipt`, `worktree-snapshot`) and bootstrap review projections with shared provenance/digest validation
- bootstrap-normalized legacy review projection records that preserve backlinks to the authoritative `runs/*/check.json` approvals
- worktree snapshot export/import flow that restores the active change from the parent working tree, not only parent `HEAD`
- atomic state/checkpoint advancement primitives so imported evidence becomes visible only after complete publish
- smoke coverage proving spool-only artifacts and schema-mismatched copied reviews remain non-authoritative until verified import

**Depends on**
- `task-00-bootstrap-v2-command-sequencing`

**Test-first Execution Order**
1. RED — write `runtime/test/artifact-import-contract-smoke.mjs`; run `[
  "node",
  "runtime/test/artifact-import-contract-smoke.mjs",
  "red"
]` to prove spool-backed worker artifacts and copied legacy review projections are not yet normalized through one verified importer.
2. GREEN — implement `runtime/lib/artifact-import.mjs` and adapt `runtime/evidence-import.mjs`; run `[
  "node",
  "runtime/test/artifact-import-contract-smoke.mjs",
  "green"
]`.
3. REFACTOR — keep import helpers minimal and rerun `[
  "node",
  "runtime/test/artifact-import-contract-smoke.mjs",
  "verify"
]` before moving to snapshot continuity.
4. RED — write `runtime/test/worktree-snapshot-import-smoke.mjs`; run `[
  "node",
  "runtime/test/worktree-snapshot-import-smoke.mjs",
  "red"
]` to prove child worktrees still fail when the active change exists only in the parent working tree.
5. GREEN — implement `runtime/lib/worktree-snapshot.mjs`, wire `runtime/hooks/worktree-create.mjs`, and expose import CLI glue in `runtime/cli.mjs`; run `[
  "node",
  "runtime/test/worktree-snapshot-import-smoke.mjs",
  "green"
]`.
6. REFACTOR — verify snapshot/import behavior stays green with `[
  "node",
  "runtime/test/worktree-snapshot-import-smoke.mjs",
  "verify"
]`.
7. RED — write `runtime/test/state-projection-atomicity-smoke.mjs`; run `[
  "node",
  "runtime/test/state-projection-atomicity-smoke.mjs",
  "red"
]` to prove state/checkpoint truth can still be partially published.
8. GREEN — implement `runtime/lib/state-projection-store.mjs` and wire atomic advancement through the importer/snapshot path; run `[
  "node",
  "runtime/test/state-projection-atomicity-smoke.mjs",
  "green"
]`.
9. REFACTOR — rerun `[
  "node",
  "runtime/test/state-projection-atomicity-smoke.mjs",
  "verify"
]` and keep temp+rename / expected-revision semantics intact.
10. VERIFY — rerun `[
  "node",
  "runtime/test/tdd-receipt-contract-smoke.mjs",
  "verify"
]` to confirm receipt policy and copied-review bootstrap both still match the durable importer contract.

**Acceptance Checks**
- [ ] `workflow import-artifact <change-id> <kind> <artifact-id>` uses one importer path for `tdd-receipt`, `worktree-snapshot`, and copied-review bootstrap normalization.
- [ ] valid approvals remain the authoritative `runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json` and `runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json` sources until any legacy review projection is verified/imported.
- [ ] copied `reviews/design-reviewer.json` and `reviews/plan-critic.json` are never trusted raw; they are normalized only through the verified importer with backlinks to their run-contract sources.
- [ ] child worktree continuity works when the parent working tree has the active change but parent `HEAD` does not.
- [ ] unimported worker/spool artifacts never count as durable evidence.
- [ ] state/checkpoint advancement is atomic and cannot publish partial truth.

## Task 2: `task-02-manifest-and-phase-checkpoints`

**Touched Files**
- Create:
  - `harness/governance/manifest.json`
  - `runtime/lib/governance-manifest.mjs`
  - `runtime/lib/stage-checkpoints.mjs`
  - `runtime/lib/schema5-migration.mjs`
  - `runtime/test/governance-manifest-contract-smoke.mjs`
  - `runtime/test/stage-checkpoint-smoke.mjs`
  - `runtime/test/schema5-migration-smoke.mjs`
- Modify:
  - `runtime/lib/stage-contract.mjs`
  - `runtime/lib/workflow.mjs`
  - `runtime/lib/handoff.mjs`
  - `runtime/cli.mjs`

**Consumes**
- Task 1 durable importer and atomic state advancement
- `harness/changes/EH-WORKFLOW-TECPC-20260806/design.md`
- current projection truth in `harness/changes/EH-WORKFLOW-TECPC-20260806/state.json`
- current workflow/stage persistence logic in `runtime/lib/{stage-contract.mjs,workflow.mjs,handoff.mjs}`

**Produces**
- `harness/governance/manifest.json` as the single machine-readable authority for stages/behaviors/agents/checkers/hooks/decisions/import policies
- per-stage checkpoint reconcile engine and `checkpoints/<stage>.json` durable artifacts
- state-as-projection model that references checkpoint digests instead of self-asserted gate truth
- explicit schema-4 detection, backup-first migration path, and `unsupported` block behavior when migration cannot be proven

**Depends on**
- `task-01-snapshot-import-state-atomicity`

**Test-first Execution Order**
1. RED — write `runtime/test/governance-manifest-contract-smoke.mjs`; run `[
  "node",
  "runtime/test/governance-manifest-contract-smoke.mjs",
  "red"
]` to prove there is no authoritative manifest yet.
2. GREEN — implement `harness/governance/manifest.json` and `runtime/lib/governance-manifest.mjs`; run `[
  "node",
  "runtime/test/governance-manifest-contract-smoke.mjs",
  "green"
]`.
3. REFACTOR — keep manifest parsing/projection boundaries minimal and rerun `[
  "node",
  "runtime/test/governance-manifest-contract-smoke.mjs",
  "verify"
]`.
4. RED — write `runtime/test/stage-checkpoint-smoke.mjs`; run `[
  "node",
  "runtime/test/stage-checkpoint-smoke.mjs",
  "red"
]` to prove stage closure still depends on scattered state and not imported evidence + checkpoint reconcile.
5. GREEN — implement `runtime/lib/stage-checkpoints.mjs` and rewire `runtime/lib/{stage-contract.mjs,workflow.mjs,handoff.mjs}`; run `[
  "node",
  "runtime/test/stage-checkpoint-smoke.mjs",
  "green"
]`.
6. REFACTOR — rerun `[
  "node",
  "runtime/test/stage-checkpoint-smoke.mjs",
  "verify"
]` before migration work.
7. RED — write `runtime/test/schema5-migration-smoke.mjs`; run `[
  "node",
  "runtime/test/schema5-migration-smoke.mjs",
  "red"
]` to prove schema-4 changes still pass silently or migrate without backup.
8. GREEN — implement `runtime/lib/schema5-migration.mjs` and CLI wiring; run `[
  "node",
  "runtime/test/schema5-migration-smoke.mjs",
  "green"
]`.
9. REFACTOR — rerun `[
  "node",
  "runtime/test/schema5-migration-smoke.mjs",
  "verify"
]` and keep unsupported/migration semantics explicit.

**Acceptance Checks**
- [ ] `harness/governance/manifest.json` is the only machine-readable governance authority.
- [ ] every checkpoint is reconciled from manifest + imported durable evidence + independent checker verdicts.
- [ ] `state.json` is projection-only and no longer self-asserts gates.
- [ ] schema-4 active changes either migrate with backup-first evidence or fail as `unsupported`.

## Task 3: `task-03-codegraph-probe-and-registry`

**Touched Files**
- Create:
  - `runtime/lib/governance-probe.mjs`
  - `runtime/test/codegraph-index-identity-smoke.mjs`
  - `runtime/test/codegraph-fallback-binding-smoke.mjs`
  - `runtime/test/registry-conformance-probe-smoke.mjs`
- Modify:
  - `runtime/lib/codegraph-index.mjs`
  - `runtime/hooks/pre-explore.mjs`
  - `runtime/hooks/session-start.mjs`
  - `runtime/lib/execution-prerequisites.mjs`
  - `runtime/doctor.mjs`
  - `.claude-plugin/plugin.json`
  - `harness/behavior-checks.json`
  - `harness/plugin/hooks-manifest.json`
  - `harness/reviewers/catalog.json`

**Consumes**
- Task 2 manifest + checkpoint engine
- current CodeGraph health logic in `runtime/lib/codegraph-index.mjs`
- current fallback gate in `runtime/hooks/pre-explore.mjs`
- current registry projections in `.claude-plugin/plugin.json`, `harness/behavior-checks.json`, `harness/plugin/hooks-manifest.json`, and `harness/reviewers/catalog.json`

**Produces**
- fatal wrong-worktree / unavailable / uninitialized CodeGraph identity detection
- run/task/behavior-bound CodeGraph attempt receipts and fallback gating
- boot/session probe that exposes registry parity and CodeGraph identity findings before governed entry
- manifest-aligned registry projections for hooks/behaviors/reviewers/plugin agents

**Depends on**
- `task-02-manifest-and-phase-checkpoints`

**Test-first Execution Order**
1. RED — write `runtime/test/codegraph-index-identity-smoke.mjs`; run `[
  "node",
  "runtime/test/codegraph-index-identity-smoke.mjs",
  "red"
]` to prove wrong-worktree or unhealthy indexes are still treated as usable.
2. GREEN — implement index identity validation in `runtime/lib/codegraph-index.mjs`; run `[
  "node",
  "runtime/test/codegraph-index-identity-smoke.mjs",
  "green"
]`.
3. REFACTOR — rerun `[
  "node",
  "runtime/test/codegraph-index-identity-smoke.mjs",
  "verify"
]`.
4. RED — write `runtime/test/codegraph-fallback-binding-smoke.mjs`; run `[
  "node",
  "runtime/test/codegraph-fallback-binding-smoke.mjs",
  "red"
]` to prove fallback still works without a valid current run/task-bound attempt.
5. GREEN — rewire `runtime/hooks/pre-explore.mjs` and `runtime/lib/execution-prerequisites.mjs`; run `[
  "node",
  "runtime/test/codegraph-fallback-binding-smoke.mjs",
  "green"
]`.
6. REFACTOR — rerun `[
  "node",
  "runtime/test/codegraph-fallback-binding-smoke.mjs",
  "verify"
]`.
7. RED — write `runtime/test/registry-conformance-probe-smoke.mjs`; run `[
  "node",
  "runtime/test/registry-conformance-probe-smoke.mjs",
  "red"
]` to prove manifest/projection drift or fatal probe findings are not surfaced consistently.
8. GREEN — implement `runtime/lib/governance-probe.mjs`, `runtime/hooks/session-start.mjs`, `runtime/doctor.mjs`, and align registry projections; run `[
  "node",
  "runtime/test/registry-conformance-probe-smoke.mjs",
  "green"
]`.
9. REFACTOR — rerun `[
  "node",
  "runtime/test/registry-conformance-probe-smoke.mjs",
  "verify"
]`.
10. VERIFY — run `[
  "node",
  "runtime/doctor.mjs",
  "--json"
]` to confirm the fatal/advisory probe surface matches the smoke assumptions.

**Acceptance Checks**
- [ ] only `indexValidity=valid` real CodeGraph queries satisfy CodeGraph-first.
- [ ] every counted CodeGraph attempt is bound to change/stage/behavior/run/task/agent/query/index validity/fallback reason.
- [ ] session start and doctor expose manifest parity + CodeGraph identity probe findings.
- [ ] plugin/hook/reviewer/behavior projections stay in parity with the manifest.

## Task 4: `task-04-route-and-clarify-quant-models`

**Touched Files**
- Create:
  - `runtime/test/route-score-six-dimension-smoke.mjs`
  - `runtime/test/clarify-interview-evidence-smoke.mjs`
  - `runtime/test/ambiguity-phase-boundary-smoke.mjs`
- Modify:
  - `runtime/lib/router-score.mjs`
  - `runtime/lib/ambiguity.mjs`
  - `runtime/lib/stage-checkpoints.mjs`
  - `runtime/lib/workflow.mjs`
- Reuse/Test:
  - `runtime/test/route-stage-separation-smoke.mjs`

**Consumes**
- Task 2 checkpoint stageData support
- Task 3 probe and registry readiness for governed clarify/route entry
- current route/clarify logic in `runtime/lib/{router-score.mjs,ambiguity.mjs,workflow.mjs}`
- current change narrative in `harness/changes/EH-WORKFLOW-TECPC-20260806/change.md`

**Produces**
- strict six-dimension route schema with total/tier/impact/threshold validation in checkpoint stage data
- clarify interview evidence model for `information-gain`, `socratic`, `grill-me`, and `scope-confirmation`
- phase-correct scoring that allows design-owned and plan-owned open items when ownership is explicit
- route/clarify runtime gates aligned to checkpoint truth rather than Markdown parsing shortcuts

**Depends on**
- `task-03-codegraph-probe-and-registry`

**Test-first Execution Order**
1. RED — write `runtime/test/route-score-six-dimension-smoke.mjs`; run `[
  "node",
  "runtime/test/route-score-six-dimension-smoke.mjs",
  "red"
]` to prove the runtime still accepts five-dimension or inconsistent route truth.
2. GREEN — implement strict route validation in `runtime/lib/router-score.mjs` and checkpoint persistence in `runtime/lib/stage-checkpoints.mjs`; run `[
  "node",
  "runtime/test/route-score-six-dimension-smoke.mjs",
  "green"
]`.
3. REFACTOR — rerun `[
  "node",
  "runtime/test/route-score-six-dimension-smoke.mjs",
  "verify"
]`.
4. RED — write `runtime/test/clarify-interview-evidence-smoke.mjs`; run `[
  "node",
  "runtime/test/clarify-interview-evidence-smoke.mjs",
  "red"
]` to prove clarify can still pass without round-by-round interview evidence.
5. GREEN — implement interview evidence persistence in `runtime/lib/{ambiguity.mjs,workflow.mjs}`; run `[
  "node",
  "runtime/test/clarify-interview-evidence-smoke.mjs",
  "green"
]`.
6. REFACTOR — rerun `[
  "node",
  "runtime/test/clarify-interview-evidence-smoke.mjs",
  "verify"
]`.
7. RED — write `runtime/test/ambiguity-phase-boundary-smoke.mjs`; run `[
  "node",
  "runtime/test/ambiguity-phase-boundary-smoke.mjs",
  "red"
]` to prove design-owned or plan-owned details still incorrectly fail clarify.
8. GREEN — implement phase-boundary ownership rules; run `[
  "node",
  "runtime/test/ambiguity-phase-boundary-smoke.mjs",
  "green"
]`.
9. REFACTOR — rerun `[
  "node",
  "runtime/test/ambiguity-phase-boundary-smoke.mjs",
  "verify"
]`.
10. VERIFY — rerun existing stage-boundary regression with `[
  "node",
  "runtime/test/route-stage-separation-smoke.mjs",
  "verify"
]`.

**Acceptance Checks**
- [ ] route truth is checkpoint stage data, not Markdown table parsing.
- [ ] route enforces six dimensions, total, tier, impact, threshold rule, and evidence refs.
- [ ] clarify checkpoint stores interview rounds, answer provenance, contradiction checks, information gain, next weakest reason, and scope confirmation.
- [ ] route remains a separate stage; `route-stage-separation-smoke` still passes.

## Task 5: `task-05-audit-stop-skills-docs-packaging-regression`

**Touched Files**
- Create:
  - `runtime/test/workflow-audit-current-stage-smoke.mjs`
  - `runtime/test/stop-audit-block-smoke.mjs`
- Modify:
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
- Reuse/Test:
  - `runtime/test/workflow-audit-smoke.mjs`
  - `runtime/test/task4-release-acceptance-smoke.mjs`
  - `test/external-project/maven-lifecycle-e2e.mjs`

**Consumes**
- Tasks 1-4 runtime contracts, projections, probes, checkpoints, route/clarify models
- current audit/stop behavior in `runtime/lib/workflow-audit.mjs` and `runtime/hooks/stop.mjs`
- packaging surface in `package.json`
- long-lived spec/skill docs under `harness/specs/**` and `.claude/skills/**`

**Produces**
- shared current-stage-aware audit engine used by `workflow audit`, `workflow status --json`, and `Stop`
- projection-only `last-audit.json` and `last-stop-check.json` semantics
- docs and skill text updated for schema-5 governance authority and recovery model
- packaging allowlist/regression coverage that includes `harness/governance/**` and excludes forbidden change/archive evidence
- final repo-level regression plan including prepublish and external-project acceptance

**Depends on**
- `task-04-route-and-clarify-quant-models`

**Test-first Execution Order**
1. RED — write `runtime/test/workflow-audit-current-stage-smoke.mjs`; run `[
  "node",
  "runtime/test/workflow-audit-current-stage-smoke.mjs",
  "red"
]` to prove current-stage blockers are still omitted from default audit/status.
2. GREEN — implement shared audit semantics in `runtime/lib/workflow-audit.mjs` and CLI wiring; run `[
  "node",
  "runtime/test/workflow-audit-current-stage-smoke.mjs",
  "green"
]`.
3. REFACTOR — rerun `[
  "node",
  "runtime/test/workflow-audit-current-stage-smoke.mjs",
  "verify"
]`.
4. RED — write `runtime/test/stop-audit-block-smoke.mjs`; run `[
  "node",
  "runtime/test/stop-audit-block-smoke.mjs",
  "red"
]` to prove Stop still fails to block on stale validation, fatal probe, missing checker, or digest mismatch.
5. GREEN — wire `runtime/hooks/stop.mjs` to the shared audit engine; run `[
  "node",
  "runtime/test/stop-audit-block-smoke.mjs",
  "green"
]`.
6. REFACTOR — rerun `[
  "node",
  "runtime/test/stop-audit-block-smoke.mjs",
  "verify"
]`.
7. RED — extend `runtime/test/task4-release-acceptance-smoke.mjs`; run `[
  "node",
  "runtime/test/task4-release-acceptance-smoke.mjs",
  "red"
]` to prove docs/packaging still omit required governance assets or include forbidden evidence paths.
8. GREEN — update `package.json`, `harness/specs/**`, and `.claude/skills/**`; run `[
  "node",
  "runtime/test/task4-release-acceptance-smoke.mjs",
  "green"
]`.
9. REFACTOR — rerun `[
  "node",
  "runtime/test/task4-release-acceptance-smoke.mjs",
  "verify"
]`.
10. VERIFY — rerun `[
  "node",
  "runtime/test/workflow-audit-smoke.mjs",
  "verify"
]`.
11. ACCEPTANCE — run `[
  "node",
  "runtime/prepublish.mjs"
]`.
12. ACCEPTANCE — run `[
  "node",
  "test/external-project/maven-lifecycle-e2e.mjs"
]`.

**Acceptance Checks**
- [ ] `workflow audit`, `workflow status --json`, and `Stop` share one current-stage-aware blocker engine.
- [ ] `last-audit.json` and `last-stop-check.json` are projection-only and never replace recomputation.
- [ ] shipped package includes `harness/governance/**` plus required specs/skills and excludes forbidden `harness/changes/**` / `harness/archive/**` evidence paths.
- [ ] repo-level regression includes both `runtime/prepublish.mjs` and `test/external-project/maven-lifecycle-e2e.mjs` before handoff to verify.
