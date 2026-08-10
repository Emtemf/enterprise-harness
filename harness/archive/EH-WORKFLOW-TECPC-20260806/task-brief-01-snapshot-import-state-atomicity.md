# Task Brief

## Change ID
EH-WORKFLOW-TECPC-20260806

## Task ID
task-01-snapshot-import-state-atomicity

## Goal
先交付 durable worker artifact importer、parent-working-tree snapshot continuity 与原子 state/checkpoint advancement，让后续任务只消费 imported durable evidence。

## Bootstrap Approval Note
- 当前可进入 TDD 的权威审批来源是 run-contract 证据，而不是 legacy review projection：
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json` (`design-reviewer`, `verdict=pass`)
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json` (`plan-critic`, `verdict=pass`)
- `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/design-reviewer.json` 与 `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/plan-critic.json` 只是 copied envelopes，当前不符合 legacy `reviews/*.json` schema，不能作为审批 gate。
- 本任务必须通过新的 verified importer 把上述 copied review projections 规范化，并保留它们回指权威 `runs/*/check.json` 的来源链。

## Touched Files
- `runtime/lib/artifact-import.mjs`
- `runtime/lib/worktree-snapshot.mjs`
- `runtime/lib/state-projection-store.mjs`
- `runtime/evidence-import.mjs`
- `runtime/hooks/worktree-create.mjs`
- `runtime/cli.mjs`
- `runtime/test/artifact-import-contract-smoke.mjs`
- `runtime/test/worktree-snapshot-import-smoke.mjs`
- `runtime/test/state-projection-atomicity-smoke.mjs`
- `runtime/test/tdd-receipt-contract-smoke.mjs`

## Consumes
- `harness/changes/EH-WORKFLOW-TECPC-20260806/design.md`
- `harness/command-policy.json`
- authoritative checker run contracts in `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json` and `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`
- copied legacy review projections in `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/design-reviewer.json` and `harness/changes/EH-WORKFLOW-TECPC-20260806/reviews/plan-critic.json`
- current importer behavior in `runtime/evidence-import.mjs`
- current worktree continuity behavior in `runtime/hooks/worktree-create.mjs`
- current receipt regression in `runtime/test/tdd-receipt-contract-smoke.mjs`

## Produces
- shared spool artifact importer for `tdd-receipt`, `worktree-snapshot`, and bootstrap review projection normalization
- normalized legacy review projection records that preserve backlinks to the authoritative `runs/*/check.json` approvals
- child-worktree snapshot/import path that does not require parent `HEAD` to contain the active change
- atomic state/checkpoint advancement primitives
- regression coverage proving spool-only artifacts and copied schema-mismatched reviews stay non-authoritative until verified import

## Dependency
- `task-00-bootstrap-v2-command-sequencing`; this task starts only after Task 00 unlocks runner support for the already-frozen v2 `commands[]` sequence format

## Test-first Order
1. RED: write `runtime/test/artifact-import-contract-smoke.mjs`
2. Run `[
  "node",
  "runtime/test/artifact-import-contract-smoke.mjs",
  "red"
]`
3. GREEN: implement minimal shared importer in `runtime/lib/artifact-import.mjs` and adapt `runtime/evidence-import.mjs`
4. Run `[
  "node",
  "runtime/test/artifact-import-contract-smoke.mjs",
  "green"
]`
5. REFACTOR: run `[
  "node",
  "runtime/test/artifact-import-contract-smoke.mjs",
  "verify"
]`
6. RED: write `runtime/test/worktree-snapshot-import-smoke.mjs`
7. Run `[
  "node",
  "runtime/test/worktree-snapshot-import-smoke.mjs",
  "red"
]`
8. GREEN: implement minimal snapshot export/import wiring in `runtime/lib/worktree-snapshot.mjs`, `runtime/hooks/worktree-create.mjs`, and `runtime/cli.mjs`
9. Run `[
  "node",
  "runtime/test/worktree-snapshot-import-smoke.mjs",
  "green"
]`
10. REFACTOR: run `[
  "node",
  "runtime/test/worktree-snapshot-import-smoke.mjs",
  "verify"
]`
11. RED: write `runtime/test/state-projection-atomicity-smoke.mjs`
12. Run `[
  "node",
  "runtime/test/state-projection-atomicity-smoke.mjs",
  "red"
]`
13. GREEN: implement minimal atomic advancement in `runtime/lib/state-projection-store.mjs` and importer/snapshot call sites
14. Run `[
  "node",
  "runtime/test/state-projection-atomicity-smoke.mjs",
  "green"
]`
15. REFACTOR: run `[
  "node",
  "runtime/test/state-projection-atomicity-smoke.mjs",
  "verify"
]`
16. VERIFY: run `[
  "node",
  "runtime/test/tdd-receipt-contract-smoke.mjs",
  "verify"
]`

## RED / GREEN / REFACTOR Evidence Expectations
- `artifact-import-contract-smoke` RED proves worker artifacts are not yet normalized through one durable importer.
- `worktree-snapshot-import-smoke` RED proves child worktree creation still breaks when the active change exists only in the parent working tree.
- `state-projection-atomicity-smoke` RED proves state/checkpoint advancement can still partially publish truth.
- GREEN commands prove each behavior is fixed minimally before moving on.
- REFACTOR commands prove the helper extraction did not weaken digest/provenance/atomicity rules.

## Acceptance Checks
- [ ] `workflow import-artifact <change-id> <kind> <artifact-id>` uses one importer path for `tdd-receipt` and `worktree-snapshot`
- [ ] child worktree continuity works when the parent working tree has the active change but parent `HEAD` does not
- [ ] unimported worker/spool artifacts never count as durable evidence
- [ ] state/checkpoint advancement is atomic and cannot publish partial truth

## Expected Output
- task-id: `task-01-snapshot-import-state-atomicity`
- status: `RED -> GREEN -> REFACTOR -> VERIFY`
- commands: exact argv frozen in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- evidence: imported artifact records, snapshot spool/import evidence, and state/checkpoint publish receipts
- next-step: `task-02-manifest-and-phase-checkpoints`
