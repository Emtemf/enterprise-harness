# Harness Clarify Fact Gate Design

## Goal

Make `skills/harness/SKILL.md` an executable Claude Code orchestration contract: applicable CodeGraph and Context7 subagents finish and produce durable `ResearchPacket` evidence before Main begins decision clarification.

## Runtime sequence

```text
Main intake
  -> initialize requirements draft from the skill asset
  -> determine required fact lanes
  -> dispatch CodeGraph and, when applicable, Context7 workers
  -> wait for every dispatched ResearchPacket to validate and persist
  -> synthesize topology and component scores from user input + facts
  -> ask one unresolved Decision at a time
  -> scope confirmation
  -> clarify finalizer
  -> independent review
  -> transition gate
```

Pending, missing, invalid, stale, or degraded high-risk fact packets block user interviewing and stage advancement. Facts are never converted into user questions. A packet may expose a genuine business choice; Main turns only that choice into one user question after all fact lanes finish.

## Resource boundaries

- `SKILL.md` contains the hard gate, exact phase order, dispatch/persistence contract, and just-in-time resource instructions.
- `assets/requirements.md.tmpl` is read only when initializing or rebuilding the requirements draft.
- `scripts/finalize-clarify-result.mjs` runs only after requirements and scope confirmation are complete.
- Operational references remain only when the Skill names the exact phase that reads them.
- Upstream method names, reviewed commits, and adoption history remain under `harness/specs/upstream-mapping.md` and `harness/upstream/registry.json`; they do not ship as Skill execution instructions.
- Behavioral eval definitions and run reports move from `skills/harness/evals/` to `test/skill-evals/harness/`, outside the packaged plugin.

## Research result persistence

The v6 SubagentStop hook will parse the agent's final assistant message as one JSON object, validate it against the handoff-bound `ResearchPacket` contract, and atomically persist it through `persistHandoffV2Result`. It will then record the normal stop receipt. Non-research v6 workers continue to persist their own StageResult/ReviewResult before stopping.

This closes the current circular contract in which research agents have no write or shell tool but SubagentStop requires a pre-existing result file.

## Compatibility

There are no installed users to preserve. Remove obsolete or unused Skill-local files and assertions instead of adding aliases. Existing v5 compatibility code is outside this change unless a touched test directly requires removal.

## Verification

- A research subagent returning a valid packet through its final message creates the durable v6 result and stop receipt.
- Invalid or missing packets fail closed and do not create a result.
- The Skill explicitly blocks topology scoring and user questions until all required fact lanes finish.
- Every packaged supporting file has a named consumption point.
- The release artifact excludes development evals.
- Targeted smoke tests and `npm run prepublish-check` pass.
