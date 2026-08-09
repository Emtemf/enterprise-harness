# Task Brief

## Change ID
EH-WORKFLOW-TECPC-20260806

## Task ID
task-00-bootstrap-v2-command-sequencing

## Goal
先交付一个零依赖 bootstrap bridge，让当前 runner 在不破坏 legacy frozen triplet 的前提下，开始消费后续任务已经冻结好的 v2 `commands[]` 序列。

## Bootstrap Bridge Note
- 本任务是当前计划唯一允许立即进入 TDD 的零依赖 bridge task。
- 它必须继续使用当前 runner 直接兼容的 legacy `redCommand` / `greenCommand` / `refactorCommand` 冻结形态。
- 本任务完成前，后续任务虽然已经在 `task-commands.json` 中冻结了 `commands[]`，但当前 runner 还不能无猜测地执行它们。

## Touched Files
- `runtime/test/task-command-v2-sequencing-smoke.mjs`
- `runtime/tdd-run.mjs`
- `runtime/lib/tdd-receipts.mjs`
- `runtime/lib/git-evidence.mjs`
- `runtime/test/tdd-receipt-contract-smoke.mjs`

## Consumes
- `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- `harness/command-policy.json`
- current legacy task freeze loading in `runtime/lib/tdd-receipts.mjs`
- current phase/argv enforcement in `runtime/tdd-run.mjs`
- current receipt contract coverage in `runtime/test/tdd-receipt-contract-smoke.mjs`

## Produces
- one zero-dependency bootstrap bridge task frozen in the current runner-compatible `redCommand` / `greenCommand` / `refactorCommand` shape
- v2 `commands[]` parsing and validation for repeated RED/GREEN/REFACTOR command sequences in `runtime/tdd-run.mjs` and `runtime/lib/tdd-receipts.mjs`
- baseline-relative changed-path computation in `runtime/lib/git-evidence.mjs`, so receipt scope covers task mutations rather than pre-existing active-change snapshot files
- focused smoke coverage proving the next frozen command is resolved by execution index while legacy single-triplet freezes remain valid

## Dependency
- none; this is the bootstrap bridge task that unblocks real RED for the already-frozen later `commands[]` tasks without changing their exact argv coverage

## Test-first Order
1. RED: write `runtime/test/task-command-v2-sequencing-smoke.mjs`
2. Run `[
  "node",
  "runtime/test/task-command-v2-sequencing-smoke.mjs",
  "red"
]`
3. GREEN: implement v2 command resolution/validation in `runtime/lib/tdd-receipts.mjs` and wire `runtime/tdd-run.mjs`
4. Run `[
  "node",
  "runtime/test/task-command-v2-sequencing-smoke.mjs",
  "green"
]`
5. REFACTOR: expand `runtime/test/tdd-receipt-contract-smoke.mjs` only as needed while keeping bootstrap legacy handling intact
6. Run `[
  "node",
  "runtime/test/task-command-v2-sequencing-smoke.mjs",
  "verify"
]`

## RED / GREEN / REFACTOR Evidence Expectations
- `task-command-v2-sequencing-smoke` RED proves `tdd-run` / `validateTddReceipt` still reject schemaVersion 2-style `commands[]` task freezes and repeated per-phase command sequences.
- GREEN proves the runtime can resolve and validate v2 command sequences without breaking the bootstrap legacy triplet.
- REFACTOR proves receipt contract coverage still accepts legacy single-triplet freezes while enforcing the new execution-index-driven sequence rules.

## Acceptance Checks
- [ ] `task-00-bootstrap-v2-command-sequencing` remains runnable through the current legacy freeze fields (`redCommand`, `greenCommand`, `refactorCommand`) with no synthetic evidence path
- [ ] `runtime/tdd-run.mjs` resolves the next allowed argv from `commands[]` by receipt execution index and still enforces explicit phase order
- [ ] `runtime/lib/tdd-receipts.mjs` validates both legacy single-triplet freezes and v2 `commands[]` freezes, rejecting missing, duplicate, or out-of-order commands
- [ ] later tasks in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json` keep their existing exact `commands[]` coverage unchanged

## Expected Output
- task-id: `task-00-bootstrap-v2-command-sequencing`
- status: `RED -> GREEN -> REFACTOR`
- commands: exact legacy argv frozen in `harness/changes/EH-WORKFLOW-TECPC-20260806/task-commands.json`
- evidence: sequence smoke receipts plus receipt-contract regression coverage
- next-step: `task-01-snapshot-import-state-atomicity`
