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

Clarify establishes a requirements topology before asking questions. It combines CodeGraph-first
project facts and Context7-first external facts with user intent. Assess component × target,
scope, actor, data, interface, acceptance, and constraint/risk; ask one highest-risk/weakest
frontier question at a time. Once the artifacts are sufficient, main Harness records the scope
confirmation and durable classification.

## Design

Design freezes applicable component boundaries, interfaces, error model, authentication,
idempotency, data/SQL, migration/rollback, compatibility, concurrency, and testing strategy.
Each inapplicable dimension is recorded as `N/A` with a reason. The reviewer sees the design
artifact plus its evidence digests, not the executor conversation.

## Plan

Plan creates independently executable tasks. Each task identifies the target, minimal RED test,
exact command argv, intended implementation surface, review rubric, verification condition, and
rollback/recovery note. The plan's task evidence becomes stale when the design digest changes.

## Implement

Implementation proceeds task by task in an isolated native worktree when code changes are needed.
A real RED receipt precedes the smallest GREEN implementation, then refactor and task review.
The implementation capability is the only capability allowed to write product code. Worktree
isolation does not establish reviewer independence.

## Verify

Verify runs the frozen validation commands and aggregates task receipts, current artifact digests,
self-checks, independent reviews, API/data/security rubrics, and waivers. `unsupported` cannot
be elevated to `pass`. A fresh validation verdict is necessary but not sufficient without the
independent completion review.

## Archive

Archive is allowed only when the completion predicate consumes fresh verification and all
required durable evidence. It moves completed work into immutable history and clears only
compatibility pointers. An unfinished change is abandoned explicitly, never disguised as archived.

## Compatibility and recovery

v4/v5 changes may be read through compatibility adapters. An active v5 change may explicitly
migrate to v6; archived history is read-only. On any missing/stale artifact or hook-health
failure, runtime returns one concrete recovery action rather than inferring progress from chat or
legacy state projections.
