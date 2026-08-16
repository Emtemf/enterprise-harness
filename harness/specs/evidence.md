---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-12
implementationRefs:
  - runtime/lib/evidence-policy.mjs
  - runtime/lib/tdd-receipts.mjs
  - runtime/core/change-state.mjs
  - runtime/core/handoff-v2.mjs
  - runtime/lib/task-execution-receipt.mjs
  - runtime/lib/waiver.mjs
  - runtime/core/completion-proof.mjs
testRefs:
  - runtime/test/evidence-policy-contract-smoke.mjs
  - runtime/test/tdd-receipt-contract-smoke.mjs
  - runtime/test/v6-change-state-smoke.mjs
  - runtime/test/task-execution-receipt-smoke.mjs
  - runtime/test/waiver-result-contract-smoke.mjs
---

# Evidence Contract

## Evidence classes

- **Artifact** — requirements, design, task plan, self-check, review, validation, waiver, and
  archive record. Each material conclusion binds to its input digest.
- **Receipt** — machine-generated command provenance: actor/capability, worktree, exact argv,
  exit code, timestamps, HEAD/tree digests, and changed paths. Narrative self-report is not a
  receipt.
- **Review** — an independent verdict that consumes a result artifact and its input digest.
- **Ledger** — append-only operational telemetry (dispatch, binding, attempt, lifecycle, and
  violation). It assists diagnosis but is not lifecycle correctness proof.

## TECPC

Every executor, self-check, reviewer, and recovery report carries Target, Evidence, Context, and
Path. `correction` is `null` for a passing report and mandatory/actionable for `advisory`,
`block`, `recovery`, or `unsupported`. `unsupported` is never promoted to pass.

## Freshness

A conclusion is fresh only when the current digest of each input it consumed still matches. A
stable artifact or governed implementation write invalidates downstream conclusions by
derivation. Do not repair freshness by flipping a state boolean. Waiver shape and artifact-digest
freshness can be validated, but an `approvedBy` string is not trusted authorization evidence. Until
runtime can bind a waiver to an immutable user/maintainer authorization record, any non-empty v6
StageResult or CompletionProof waiver list fails closed. A waiver never changes a hard block into
an advisory outcome.

## Completion

Completion evaluates fresh artifacts, task receipts, self-checks, independent review, applicable
API/data/security rubrics, validation, and archive evidence. The result has a stable
`{code,status,path,message,recovery}` shape. A hook, worker chat message, or stale review alone
cannot establish completion.

## Distribution boundary

A target repository creates its evidence policy from its own Git HEAD. Release artifacts never
contain the source repository's active changes, archive, receipt spool, or evidence policy.
