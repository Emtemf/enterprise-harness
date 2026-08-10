# Task Brief

## Change ID
EH-WORKFLOW-TECPC-20260806

## Task ID
task-00-bootstrap-v2-command-sequencing

## Goal
先交付一个窄范围、可审计的 recovery importer，让隔离 executor 已产出的 Task 00 计划修订，在具备独立 checker `pass` / `advisory` 绑定、输出文件 SHA-256 一致、路径白名单与冲突检查都满足时，能被原子发布到权威 worktree，从而打破 bootstrap deadlock。

## Bootstrap Recovery Note
- 本任务是当前计划唯一允许新增的 bootstrap 能力。
- 它必须继续使用当前 runner 直接兼容的 legacy `redCommand` / `greenCommand` / `refactorCommand` 冻结形态。
- 它不是通用 artifact importer，不处理 state/review/validation，也不扩展到 Task 01 的 generic importer / snapshot / state atomicity。
- 它只服务于把 Task 00 三份计划资产从 executor run 输出安全导入权威 worktree，进而让原先卡在隔离 worktree 外的 v2 command sequencing 与 handoff 输入修订真正成为后续 TDD 的权威输入。

## Touched Files
- `runtime/lib/bootstrap-recovery-import.mjs`
- `runtime/evidence-import.mjs`
- `runtime/cli.mjs`
- `runtime/test/bootstrap-recovery-import-smoke.mjs`

## Consumes
- `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- `harness/command-policy.json`
- `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_876e34ac-bc9e-4b65-a3ed-41892666336a/check.json`
- `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_7cc149db-4e4c-46b4-83c5-43ac6f3329a7/check.json`
- current artifact import / publish behavior in `runtime/evidence-import.mjs`
- current CLI import surface in `runtime/cli.mjs`
- executor-produced source outputs for exactly these three plan assets only:
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/tasks.md`
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/task-brief-00-bootstrap-v2-command-sequencing.md`

## Produces
- one bootstrap-only recovery importer for exactly the three Task 00 plan assets
- provenance validation requiring a source executor run plus an independent checker run bound to it
- checker-verdict enforcement that accepts only `pass` / `advisory` and rejects `block`
- per-file SHA-256 verification against the specified source output files before publish
- whitelist and target-conflict rejection for non-parent bindings, non-whitelisted paths, and existing different bytes
- temp + rename atomic publish semantics
- one durable recovery receipt with run/check linkage, per-file digests, target paths, checker verdict, and publish provenance
- focused smoke coverage proving this bootstrap importer is the bridge for the already-needed v2 command sequencing / handoff-input plan correction, not a broader generic importer

## Dependency
- none; this is the bootstrap recovery bridge that must land before Task 01 can widen into generic import, snapshot continuity, and state atomicity

## Test-first Order
1. RED: write `runtime/test/bootstrap-recovery-import-smoke.mjs`
2. Run `[
  "node",
  "runtime/test/bootstrap-recovery-import-smoke.mjs",
  "red"
]`
3. GREEN: implement `runtime/lib/bootstrap-recovery-import.mjs` and wire `runtime/evidence-import.mjs` plus `runtime/cli.mjs`
4. Run `[
  "node",
  "runtime/test/bootstrap-recovery-import-smoke.mjs",
  "green"
]`
5. REFACTOR: keep the importer bootstrap-only, preserve whitelist/conflict/atomic-publish/receipt guarantees
6. Run `[
  "node",
  "runtime/test/bootstrap-recovery-import-smoke.mjs",
  "verify"
]`

## RED / GREEN / REFACTOR Evidence Expectations
- `bootstrap-recovery-import-smoke` RED proves the current bootstrap path cannot legally promote corrected Task 00 plan outputs from an executor run into the authoritative worktree, leaving the v2 `commands[]` sequencing and handoff-input correction stranded.
- GREEN proves the runtime can import those three plan assets only when executor/checker binding, checker verdict, per-file SHA-256, whitelist, and conflict checks all pass.
- REFACTOR proves publish remains temp+rename atomic, receipt-backed, and bootstrap-scoped without widening into Task 01's generic importer.

## Acceptance Checks
- [ ] bootstrap recovery import succeeds only when the source executor run is explicitly bound to an independent checker run whose verdict is `pass` or `advisory`
- [ ] bootstrap recovery import rejects checker `block`, missing or non-parent bindings, non-whitelisted target paths, SHA-256 mismatches, and targets whose existing contents differ from the imported bytes
- [ ] publish uses temp + rename atomicity and emits one durable recovery receipt containing run/check linkage, per-file digest evidence, target paths, checker verdict, and provenance
- [ ] Task 00 remains bootstrap-scoped: it imports only `tasks.md`, `task-commands.json`, and `task-brief-00-bootstrap-v2-command-sequencing.md`, and does not widen into the generic artifact importer reserved for Task 01
- [ ] the recovered `task-commands.json` / task brief content is the bridge that makes the earlier v2 command sequencing and handoff-input corrections authoritative, without changing later task argv beyond the recovered source output

## Expected Output
- task-id: `task-00-bootstrap-v2-command-sequencing`
- status: `RED -> GREEN -> REFACTOR`
- commands: exact legacy argv frozen in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- evidence: bootstrap recovery import smoke receipts plus one durable recovery receipt
- next-step: `task-01-snapshot-import-state-atomicity`
