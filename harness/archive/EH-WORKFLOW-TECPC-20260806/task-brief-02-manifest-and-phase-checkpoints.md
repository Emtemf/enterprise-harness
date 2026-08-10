# Task Brief

## Change ID
EH-WORKFLOW-TECPC-20260806

## Task ID
task-02-manifest-and-phase-checkpoints

## Goal
建立 schema 5 governance manifest 与 stage checkpoint 作为唯一 machine-readable authority，并把 schema 4 路径显式转成 backup-first migration 或 unsupported block。

## Bootstrap Evidence Note
- 本任务默认 design / plan 审批已在 run-contract 层通过：`runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json` 与 `runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`。
- 但任何 legacy `reviews/*.json` copied envelopes 只有在 Task 1 完成 verified import / normalization 后才可被 checkpoint 或 projection 消费。
- 因此本任务的前置条件不是“手工相信 reviews 文件”，而是“Task 1 已完成 bootstrap resolution 并保留 review-to-run backlinks”。

## Touched Files
- `harness/governance/manifest.json`
- `runtime/lib/governance-manifest.mjs`
- `runtime/lib/stage-checkpoints.mjs`
- `runtime/lib/schema5-migration.mjs`
- `runtime/lib/stage-contract.mjs`
- `runtime/lib/workflow.mjs`
- `runtime/lib/handoff.mjs`
- `runtime/cli.mjs`
- `runtime/test/governance-manifest-contract-smoke.mjs`
- `runtime/test/stage-checkpoint-smoke.mjs`
- `runtime/test/schema5-migration-smoke.mjs`

## Consumes
- task 1 durable importer and atomic advancement primitives
- `harness/changes/EH-WORKFLOW-TECPC-20260806/design.md`
- current projection truth in `harness/changes/EH-WORKFLOW-TECPC-20260806/state.json`
- current stage/workflow persistence in `runtime/lib/{stage-contract.mjs,workflow.mjs,handoff.mjs}`

## Produces
- `harness/governance/manifest.json` as the only machine-readable governance authority
- checkpoint reconcile logic and `checkpoints/<stage>.json` durable artifacts
- projection-only `state.json` semantics keyed by checkpoint digests
- schema 4 detect/migrate/block contract with backup-first evidence

## Dependency
- `task-01-snapshot-import-state-atomicity`

## Test-first Order
1. RED: write `runtime/test/governance-manifest-contract-smoke.mjs`
2. Run `[
  "node",
  "runtime/test/governance-manifest-contract-smoke.mjs",
  "red"
]`
3. GREEN: implement minimal manifest authority in `harness/governance/manifest.json` and `runtime/lib/governance-manifest.mjs`
4. Run `[
  "node",
  "runtime/test/governance-manifest-contract-smoke.mjs",
  "green"
]`
5. REFACTOR: run `[
  "node",
  "runtime/test/governance-manifest-contract-smoke.mjs",
  "verify"
]`
6. RED: write `runtime/test/stage-checkpoint-smoke.mjs`
7. Run `[
  "node",
  "runtime/test/stage-checkpoint-smoke.mjs",
  "red"
]`
8. GREEN: implement minimal reconcile/checkpoint flow in `runtime/lib/stage-checkpoints.mjs` and rewire `runtime/lib/{stage-contract.mjs,workflow.mjs,handoff.mjs}`
9. Run `[
  "node",
  "runtime/test/stage-checkpoint-smoke.mjs",
  "green"
]`
10. REFACTOR: run `[
  "node",
  "runtime/test/stage-checkpoint-smoke.mjs",
  "verify"
]`
11. RED: write `runtime/test/schema5-migration-smoke.mjs`
12. Run `[
  "node",
  "runtime/test/schema5-migration-smoke.mjs",
  "red"
]`
13. GREEN: implement minimal schema 4 detection and backup-first migration/block flow in `runtime/lib/schema5-migration.mjs` and `runtime/cli.mjs`
14. Run `[
  "node",
  "runtime/test/schema5-migration-smoke.mjs",
  "green"
]`
15. REFACTOR: run `[
  "node",
  "runtime/test/schema5-migration-smoke.mjs",
  "verify"
]`

## RED / GREEN / REFACTOR Evidence Expectations
- `governance-manifest-contract-smoke` RED proves no single governance authority exists yet.
- `stage-checkpoint-smoke` RED proves stage closure still depends on scattered state instead of manifest + imported evidence + independent checker truth.
- `schema5-migration-smoke` RED proves schema 4 changes still pass silently or migrate without backup evidence.
- GREEN commands prove each behavior is fixed minimally in sequence.
- REFACTOR commands prove helper extraction does not reintroduce self-asserted gate truth.

## Acceptance Checks
- [ ] `harness/governance/manifest.json` is the only machine-readable governance authority
- [ ] every checkpoint is reconciled from manifest, imported durable evidence, and independent checker verdicts
- [ ] `state.json` is projection-only and does not self-assert gates
- [ ] schema 4 active changes either migrate with backup-first evidence or fail as `unsupported`

## Expected Output
- task-id: `task-02-manifest-and-phase-checkpoints`
- status: `RED -> GREEN -> REFACTOR`
- commands: exact argv frozen in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- evidence: manifest artifact, checkpoint artifacts, migration backup/block evidence
- next-step: `task-03-codegraph-probe-and-registry`
