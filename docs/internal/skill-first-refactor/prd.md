# Skill-First Refactor PRD

## Problem

The repository has a v6 design surface, but its execution paths still mix v2 and legacy v1 handoffs, retain route/TDD lifecycle assumptions, and distribute workflow rules across skills, hooks, runtime, and compatibility tests. That makes the plugin look Claude Code-native without reliably behaving that way.

## Product outcome

Deliver a Claude Code-only engineering harness whose user-visible flow is:

```text
clarify → design → plan → implement → verify → archive
```

It must be skill-driven and recoverable without turning hooks into a second workflow engine.

## Non-negotiable behavior

- Main Harness owns user conversation and business decisions.
- Code facts come from a context-isolated `code-explore` subagent using CodeGraph first.
- library/SDK facts come from a context-isolated `doc-research` subagent using Context7 first.
- Main-stage skills fork explicitly bound capability agents; result-dependent dispatches are foregrounded.
- Each stage performs an explicit self-check, then an independent reviewer run that loads a review skill/rubric.
- Runtime aggregates verified execution and review evidence into completion proof, derives freshness from digests, and alone advances state.
- Hooks protect host-bound invariants, record mechanical evidence, and report recovery; they do not implement workflow semantics.
- Exactly five capability agents exist: `code-explore`, `doc-research`, `artifact-worker`, `implementer`, and `reviewer`.

## Success criteria

1. No user-visible or state transition can skip the six-stage topology.
2. Every forked stage skill has an explicit agent and `background: false` when its output gates the caller.
3. Research agents are genuinely read-only and have the tools their contracts name.
4. A changed artifact automatically makes dependent stage proof/review stale.
5. Tests cover contract wiring and a real Claude Code plugin execution path separately.
