# Harness Clarify Fact Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Harness Clarify into a fact-first executable Skill whose required CodeGraph/Context7 subagents finish before Main asks decision questions.

**Architecture:** Keep Main inline as the user-facing controller. Fork code and documentation fact lanes through Handoff v2, persist returned ResearchPackets in the v6 SubagentStop hook, then allow Main to synthesize topology and interview only unresolved Decisions. Keep runtime instructions in `SKILL.md` and move development-only provenance/evals outside the packaged Skill.

**Tech Stack:** Claude Code plugin Skills and subagents, Node.js 20/22 ESM runtime, Handoff v2 JSON schemas, Node smoke tests.

**Spec:** `docs/superpowers/specs/2026-08-21-harness-clarify-fact-gate-design.md`

## Global Constraints

- Main remains the only user interaction surface and must not use `context: fork`.
- Code facts use `enterprise-harness:code-explore`; external version facts use `enterprise-harness:doc-research` through `research-docs`.
- A required Fact is never asked of the user.
- No compatibility aliases or duplicate execution paths are retained.
- Runtime changes require targeted behavior tests and `npm run prepublish-check`.

---

### Task 1: ResearchPacket stop persistence

**Files:**
- Modify: `runtime/lib/hooks/subagent-stop.mjs`
- Test: `runtime/test/subagent-stop-v2-research-persist-smoke.mjs`

**Interfaces:**
- Consumes: v6 research execute handoff plus `last_assistant_message` containing a ResearchPacket JSON object.
- Produces: a validated canonical `result.json` through `persistHandoffV2Result` and a durable stop ledger entry.

- [ ] Write a failing test that creates a v6 research handoff and passes a valid packet only through `last_assistant_message`.
- [ ] Run it and confirm failure reports the missing pre-persisted v6 result.
- [ ] Parse, validate, and persist research packets inside the stop hook while preserving the existing pre-persisted path for other workers.
- [ ] Add invalid/missing packet cases and confirm fail-closed behavior.
- [ ] Run the focused test until green.

### Task 2: Fact-first Harness execution contract

**Files:**
- Modify: `skills/harness/SKILL.md`
- Modify: `skills/harness/assets/requirements.md.tmpl`
- Modify: `skills/explore-code/SKILL.md`
- Modify: `skills/research-docs/SKILL.md`
- Test: `runtime/test/harness-fact-gate-smoke.mjs`
- Test: `runtime/test/harness-standard-skill-smoke.mjs`

**Interfaces:**
- Consumes: original request, applicable attachments as untrusted evidence, workflow status, and durable ResearchPackets.
- Produces: fact-complete requirements draft, confirmed topology/scoring ledger, and finalized Clarify StageResult.

- [ ] Write a failing contract test for the explicit Discover Facts -> Wait -> Decision Clarify order and supporting-file consumption points.
- [ ] Confirm the current Skill fails the ordering and wiring assertions.
- [ ] Rewrite the Skill around entry, facts gate, decision loop, finalization, and later-stage routing.
- [ ] Make asset/script/reference reads and commands just-in-time and explicit.
- [ ] Fix fact-lane Skill frontmatter and output instructions so each worker returns one machine-parseable JSON object.
- [ ] Run focused Skill tests until green.

### Task 3: Development asset separation and contracts

**Files:**
- Move: `skills/harness/evals/evals.json` -> `test/skill-evals/harness/evals.json`
- Move: `skills/harness/evals/2026-08-21-sonnet.md` -> `test/skill-evals/harness/2026-08-21-sonnet.md`
- Modify: `runtime/test/harness-standard-skill-smoke.mjs`
- Modify: `runtime/test/artifact-content-smoke.mjs`
- Modify: `harness/specs/skill-packaging.md`
- Modify: `harness/specs/ambiguity-scoring.md`
- Modify: `harness/specs/upstream-mapping.md`
- Modify: `harness/specs/README.md`

**Interfaces:**
- Consumes: official progressive-disclosure and repo truth-layer rules.
- Produces: a release artifact containing runtime Skill resources but excluding development evals and provenance narration.

- [ ] Add a failing artifact assertion that development evals are absent from the package.
- [ ] Move eval assets and update tests to their development-only location.
- [ ] Remove unused Skill references or add an exact phase consumer for each retained file.
- [ ] Synchronize current specs and their implementation/test references.
- [ ] Run packaging and documentation consistency tests.

### Task 4: Full verification and delivery

**Files:**
- Review all modified files.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified commit on `main` and pushed `origin/main`.

- [ ] Run all directly related smoke tests.
- [ ] Run `npm run prepublish-check` and inspect the complete exit status.
- [ ] Review the diff for unrelated or generated-file edits.
- [ ] Commit only the intended paths with a focused message.
- [ ] Push `main` to `origin/main` and verify branch synchronization.
