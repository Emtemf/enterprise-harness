---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-21
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

## Source methodologies

The lifecycle design draws from:

- **mattpocock/skills** (grill-me): design tree, decision tree, frontier analysis, gradual uncertainty elimination. Primary influence on Clarify frontier strategy.
- **Yeachan-Heo/oh-my-claudecode** (deep-interview): Socratic questioning, ambiguity gate, Round 0 topology, weakest uncertainty first. Primary influence on component topology and scoring.
- **obra/superpowers**: brainstorming → understanding → design → user confirmation → implementation. Primary influence on the Clarify→Design ordering, TDD execution, and verification-before-completion.
- **Fission-AI/OpenSpec**: active change artifact model, archive. Primary influence on durable change structure.
- **Joel Parker Henderson ADR patterns**: Context → Decision → Consequences → Status. Primary influence on Design decision recording and trade-off documentation.
- **BDD / Acceptance Test-Driven Development**: Given/When/Then acceptance criteria, executable specifications. Primary influence on Plan task verification conditions.
- **Mike Cohn / Martin Fowler Testing Pyramid**: unit → integration → E2E test distribution. Primary influence on Verify command strategy.
- **INVEST criteria** (Independent, Negotiable, Valuable, Estimable, Small, Testable): Primary influence on Plan task sizing and independence.
- **CodeGraph**: Code Fact Lane (code structure, symbols, call graphs, impact).
- **Context7**: Documentation Fact Lane (third-party library behavior, API contracts).

## Clarify

Clarify establishes a component topology before asking questions. It follows three fused methodologies:

1. **Round 0 Topology** (from deep-interview): split the user request into component tree using CodeGraph code facts, Context7 doc facts, and existing decisions.
2. **Component × Dimension Assessment** (from grill-me frontier): for each component, assess Goal, Scope, Constraints, Acceptance, Context. API/Data are conditional branches expanded only when impact or facts make them relevant.
3. **Weakest-First Iteration** (from deep-interview + issue #68): breadth-first over main architecture surfaces; limited consecutive deep-dive (2-4 questions) on high-coupled topics; one question per turn with options and recommendation.

The core principle: **Facts are gathered by Agent (CodeGraph/Context7); only business decisions, compatibility trade-offs, scope, and risk acceptance are asked of the user.**

Fast Path: when requirements are already clear, code facts confirm affected paths, every active
component's critical dimensions are at least 4, and no high-risk assumptions exist, 0-1 questions
may complete scope confirmation. Fast Path reduces interview length, not readiness or evidence gates.
It first produces a provisional topology, scores, and requirements summary; the original request may
serve as the confirmation source only when it explicitly authorizes the complete scope, otherwise one
combined question confirms topology, requirements, and scope.

Once artifacts are sufficient, Main records scope confirmation and the durable classification artifact.

## Design

Design follows superpowers brainstorming methodology: understand (clarify completed) → design
(component boundaries, interfaces, error model, authentication, idempotency, data/SQL,
migration/rollback, compatibility, concurrency, testing strategy) → user confirmation on key
decisions → then plan. Each inapplicable dimension is recorded as `N/A` with a reason.

Design decisions follow ADR (Architecture Decision Record) patterns: each decision records
Context → Decision → Consequences → Status. Alternatives considered must be documented.
Trade-offs between scalability, security, compatibility, and complexity are made explicit.
The reviewer sees the design artifact plus its evidence digests, not the executor conversation.

## Plan

Plan creates independently executable tasks following superpowers writing-plans methodology and
INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable). Each task is
small enough to review in one pass, independent of other tasks' implementation, and testable
through its frozen verification command. Tasks follow BDD-style acceptance criteria
(Given/When/Then) where applicable.

Each task identifies its target, execution strategy (`tdd`, `direct`, `migration`, or another
declared strategy), exact command argv, intended implementation surface, review rubric,
verification condition, and rollback/recovery note. A task using `tdd` also identifies its
minimal RED test and required RED→GREEN evidence. The plan's task evidence becomes stale when
the design digest changes.

## Implement

Implementation proceeds task by task in an isolated native worktree when code changes are needed,
following superpowers TDD methodology for code-logic tasks. The declared execution strategy
controls the task flow: a `tdd` task requires a real RED receipt before the smallest GREEN
implementation and refactor; direct and migration tasks require their own explicit preconditions
and receipts. The implementation capability is the only capability allowed to write product code.
Worktree isolation does not establish reviewer independence.

## Verify

Verify follows superpowers verification-before-completion: evidence before claims. It runs the
frozen validation commands and aggregates task receipts, current artifact digests, self-checks,
independent reviews, and applicable API/data/security rubrics.

Verification follows the testing pyramid principle (Mike Cohn / Martin Fowler): many fast unit
tests at the base, fewer integration tests, and minimal end-to-end tests for critical paths.
Each verification command produces a receipt with argv, exit code, timestamps, and output digests.
`unsupported` cannot be elevated to `pass`. Waivers fail closed until they are bound to trusted
authorization evidence. A fresh validation verdict is necessary but not sufficient without the
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
