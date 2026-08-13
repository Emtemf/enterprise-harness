---
name: harness
description: Enterprise Harness 六阶段 v0.5 生命周期的用户入口。
---

# Harness

Harness alone owns the conversation, scope confirmation, durable state transitions, and recovery.
It drives the user-visible lifecycle:

```text
clarify → design → plan → implement → verify → archive
```

Classification is recorded after clarify as an internal artifact; it selects impact-sensitive
rubrics but is not displayed as a stage. TDD is a task strategy inside implement.

## Intake and clarify

1. Resume the active change and report one actionable blocker, or create a safe new change.
2. Obtain code facts through `code-explore` and external facts through `doc-research` using v2
   handoffs. Do not repeat a worker's exploration in the main context.
3. Build the component × seven-dimension topology: target, scope, actor, data, interface,
   acceptance, constraint/risk.
4. Ask **one** highest-risk/weakest-frontier user question at a time with `AskUserQuestion`.
   Never ask for facts already established by CodeGraph or documentation evidence.
5. Persist requirements, scope confirmation, and classification only after self-check and an
   independent `reviewer` verdict are fresh.

## Stage orchestration

- **Design:** invoke `artifact-worker` with the `design` methodology, then independent `review`.
- **Plan:** invoke `artifact-worker` with `plan`; each task freezes its RED point and exact argv.
- **Implement:** invoke `implementer` with `implement` in a native worktree; require receipt,
  self-check, and separate reviewer.
- **Verify:** invoke `artifact-worker` with `verify`, run frozen validation argv, then final review.
- **Archive:** invoke `artifact-worker` with `archive`; archive only after fresh completion evidence.

A forked capability returns `NEEDS_DECISION` when business input is absent. Harness translates it
into one user question, records the answer, and creates a new run. It never delegates that dialogue.

## Evidence rule

Every stage/task follows `execute → self-check → independent review → TECPC → fresh evidence`.
The reviewer only consumes result artifacts and input digests. Do not claim progress from a chat
answer, an agent lifecycle event, or a state boolean.

## User output

Keep every response to: `changeId`, current stage, one evidence-backed status, and exactly one
next action or one question.
