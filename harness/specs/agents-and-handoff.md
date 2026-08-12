---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-12
implementationRefs:
  - skills/harness/SKILL.md
  - agents/
  - runtime/lib/handoff.mjs
  - runtime/core/handoff-v2.mjs
testRefs:
  - runtime/test/handoff-contract-smoke.mjs
  - runtime/test/handoff-v2-common-dir-smoke.mjs
  - runtime/test/main-owned-decisions-smoke.mjs
---

# Agents and Handoff Contract

## Authority boundaries

The main `harness` skill is the only user-facing orchestrator. It owns questions, scope
confirmation, state transitions, and recovery. A forked worker has no user dialogue authority:
when it needs a user decision, it returns a compact `NEEDS_DECISION` record to main Harness.

Skills carry methodology. Agents carry a distinct tool/context/isolation boundary. Runtime
records transport and durable receipts. Hooks protect host boundaries only. No correctness claim
may depend on a nested subagent being available: direct main-to-capability dispatch is the
supported path.

## Quality loop

Every governed stage and implementation task follows:

```text
execute → self-check artifact → independent review → TECPC → fresh evidence → next gate
```

The executor and reviewer are separate runs. Review consumes the executor result artifact and
its input digests, never the executor conversation. A worker self-report is evidence, not a
verdict.

## Handoff versions

### v1 compatibility

`runtime/lib/handoff.mjs` remains the reader/writer for active v4/v5 behavior-registry runs.
It is compatibility transport only; v6 core does not derive lifecycle authority from it.

### v2 canonical transport

`runtime/core/handoff-v2.mjs` writes run inputs beneath the git common directory:

```text
<git-common-dir>/enterprise-harness/runs/<changeId>/<runId>/
├── input.json
├── result.json
└── check.json
```

Workers locate v2 input by `changeId` and `runId`, not by a path relative to the controller or
main checkout. Input contains identity, role, agent capability, TECPC, input references and
digests. It is safe across native worktrees. `check` requires a `parentRunId` and consumes the
execute result.

## TECPC

Every result must contain Target, Evidence, Context, and Path. `correction` is `null` for
`pass`; it is required and actionable for `advisory`, `block`, or recovery. `unsupported` is not
silently converted into `pass`.

## Capability direction

The 0.5 target agent surface is five capabilities: code exploration, documentation research,
artifact work, implementation, and independent review. The current specialized v4/v5 agents are
compatibility adapters during migration; new lifecycle correctness must use capability contracts,
not the old role names or a persisted behavior stage graph.
