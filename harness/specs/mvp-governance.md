# MVP Governance Spec

## Stable expectation

Any adopted service repository should visibly provide:

- a root governance entrypoint (`CLAUDE.md`)
- auto-loaded rules under `.claude/rules/`
- reviewer / worker definitions under `.claude/agents/`
- hook executors under `harness/plugin/runtime/hooks/`
- durable artifacts under `harness/`
- an owned OpenAPI contract for service APIs
- both unit and local DB-backed integration tests for at least one vertical slice

## Phase-1 hard gates

1. requirement correctness
2. design completeness and architecture fit
3. plan executability and clarity
4. API contract consistency
5. verification evidence

## MVP proof point

The local MVP proves the governance skeleton and one Java reference service cancellation slice can be inspected and verified in one workspace.
