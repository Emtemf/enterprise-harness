---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-12
implementationRefs:
  - runtime/core/change-state.mjs
  - runtime/compat/v5-migrate.mjs
  - runtime/core/handoff-v2.mjs
  - runtime/lib/state-store.mjs
testRefs:
  - runtime/test/v6-change-state-smoke.mjs
  - runtime/test/v5-state-migration-smoke.mjs
  - runtime/test/migrate-v5-cli-smoke.mjs
---

# State Schema Contract

`schemaVersion: 6` is the authoritative state shape for new changes. The machine-readable
schema belongs in `harness/schemas/state.schema.json`; this contract defines the rules that
make its values meaningful.

## Minimal authoritative state

A v6 `state.json` contains only mechanical, revisioned facts:

- identity: `changeId`, `revision`, `lifecycle`, `owner`, controller identity;
- current lifecycle position: `stage` in `clarify → design → plan → implement → verify → archive`;
- artifact index: `artifacts`, including the digest-bound `classification.json` reference;
- active task/blocker and validation digest/status.

`classification.json` is the authority for durable business classification: its `impact` matrix
(`api`, `data`, `architecture`, `rule`, `security`) and any classification decision select
exploration and review rubrics. `state.json` keeps only
`artifacts.classification = { path, digest }` after clarification; it must not duplicate `impact`
or `classification` fields. Before clarification completes, that reference is explicitly `null`.
Session bindings and locks are common-dir coordination records, never state fields.

Classification is durable but internal. It is not a user-visible stage. TDD is an implementation
method, not a lifecycle stage.

A v6 state **must not** persist readiness or approval conclusions such as `routeReady`,
`designApproved`, `planReady`, `redVerified`, `tddStatus`, or a list of required reviewers.
Those conclusions are derived from the current artifact digests, receipt evidence, self-check,
and independent review artifacts. Changing an input makes the conclusion stale without a
second mutable boolean to repair.

## Mutation rule

`updateChangeState()` in `runtime/core/change-state.mjs` is the only v6 mutation primitive:

```text
read latest → copy immutable input → mutate → validate v6 shape → revision + 1
→ CAS under file lock → atomic write → append idempotent event
```

Callers provide an immutable update function; it must return a complete next value. A stale
revision produces `EH-STATE-REVISION-014`; invalid state produces `EH-STATE-SCHEMA-018`.
No caller may use direct `writeFile` for active v6 state. Events are durable audit records, not
a second state model.

## Freshness

Reviews, receipts, and validation bind to their input artifact digest. Waiver shape can likewise
bind an artifact digest, but v6 does not accept a non-empty waiver list until trusted authorization
evidence exists. `fresh` means the evidence was produced for exactly the material now being
judged. `stale` is derived when an indexed input changes; it is never repaired by setting a
ready/approved field.

## Compatibility boundary

- v4/v5 readers are compatibility-only and may explain historical state.
- Archived historical changes are read-only and are never migrated in place.
- An active v5 change requires explicit `enterprise-harness migrate-v5 <change-id> --confirm`.
  The migration resets revision to 1, maps `route` to `design` and `tdd` to `implement`, writes
  a digest-bound `classification.json` from legacy impact/classification data, clears derived
  artifacts, and makes validation stale.
- `runtime/compat/**` is the sole place allowed to interpret legacy lifecycle projections.

## Common-dir runtime state

Ephemeral coordination belongs outside worktrees:

```text
<git-common-dir>/enterprise-harness/
├── sessions/
├── locks/
├── ledger/
└── runs/<changeId>/<runId>/
```

The change directory holds durable business artifacts. Session bindings, locks, leases, and
handoff transport must not be treated as durable completion proof.
