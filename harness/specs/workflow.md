---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-12
implementationRefs:
  - skills/harness/SKILL.md
  - runtime/core/change-state.mjs
  - runtime/core/handoff-v2.mjs
  - runtime/lib/workflow.mjs
testRefs:
  - runtime/test/main-owned-decisions-smoke.mjs
  - runtime/test/v6-change-state-smoke.mjs
  - runtime/test/handoff-v2-common-dir-smoke.mjs
---

# Workflow Contract

The v6 user-visible lifecycle is exactly:

```text
clarify → design → plan → implement → verify → archive
```

Classification is a durable internal action after clarification. It records impact across API,
data, architecture, rule, and security, then chooses applicable exploration and review rubrics.
It is not a user-visible stage. TDD is the implementation strategy for a task, not a lifecycle
stage. `route` and `tdd` names occur only in v4/v5 compatibility readers and historical records.

## Common quality gate

Each stage/task advances only after its current inputs have:

```text
execution → self-check → independent review → TECPC → fresh digest-bound evidence
```

A user decision is owned solely by main Harness. Workers return `NEEDS_DECISION` if an input is
missing; they do not open user prompts. Freshness is derived from digests, not persisted
`ready`/`approved` booleans.

## Clarify

Clarify establishes a component topology before asking questions. For each component it assesses goal,
scope, constraints, acceptance, and business/domain context. API and Data/SQL are conditional branches:
they are expanded only when facts or impact make them relevant. CodeGraph-first project facts and
Context7-first external facts are gathered by isolated workers; ask one highest-risk unresolved
user-decision frontier at a time. Once the artifacts are sufficient, Main records scope confirmation
and the durable classification artifact.

## Design

Design freezes applicable component boundaries, interfaces, error model, authentication,
idempotency, data/SQL, migration/rollback, compatibility, concurrency, and testing strategy.
Each inapplicable dimension is recorded as `N/A` with a reason. The reviewer sees the design
artifact plus its evidence digests, not the executor conversation.

## Plan

Plan creates independently executable tasks. Each task identifies its target, execution strategy
(`tdd`, `direct`, `migration`, or another declared strategy), exact command argv, intended
implementation surface, review rubric, verification condition, and rollback/recovery note. A task
using `tdd` also identifies its minimal RED test and required RED→GREEN evidence. The plan's task
evidence becomes stale when the design digest changes.

## Implement

Implementation proceeds task by task in an isolated native worktree when code changes are needed.
The declared execution strategy controls the task flow: a `tdd` task requires a real RED receipt
before the smallest GREEN implementation and refactor; direct and migration tasks require their
own explicit preconditions and receipts. The implementation capability is the only capability
allowed to write product code. Worktree isolation does not establish reviewer independence.

## Verify

Verify runs the frozen validation commands and aggregates task receipts, current artifact digests,
self-checks, independent reviews, and applicable API/data/security rubrics. `unsupported` cannot
be elevated to `pass`. Waivers fail closed until they are bound to trusted authorization evidence.
A fresh validation verdict is necessary but not sufficient without the independent completion
review.

## Archive

Archive is allowed only when the completion predicate consumes fresh verification and all
required durable evidence. It moves completed work into immutable history and clears only
compatibility pointers. An unfinished change is abandoned explicitly, never disguised as archived.

## Compatibility and recovery

v4/v5 changes may be read through compatibility adapters. An active v5 change may explicitly
migrate to v6; archived history is read-only. On any missing/stale artifact or hook-health
failure, runtime returns one concrete recovery action rather than inferring progress from chat or
legacy state projections.
