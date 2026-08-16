# System Design

## Lifecycle graph

```text
clarify ──▶ design ──▶ plan ──▶ implement ──▶ verify ──▶ archive
```

The transition graph is a single runtime constant. `transition(changeId, targetStage)` validates that `targetStage` is the sole legal successor, verifies the departing stage's current completion proof, and commits the revision with the state store's atomic CAS. Rewind is a separate explicit operation; no caller can transition backward or skip forward.

## Capability mapping

| Skill | Forked agent | Purpose |
|---|---|---|
| `explore-code` | `code-explore` | CodeGraph fact lane |
| `research-docs` | `doc-research` | Context7 fact lane |
| `design`, `plan`, `verify`, `archive` | `artifact-worker` | durable non-product artifacts |
| `implement` | `implementer` | product/task worktree writes |
| `review` | `reviewer` | independent rubric review |

Each skill links references explicitly, uses `${CLAUDE_SKILL_DIR}` for bundled files, and defines the execution/self-check/evidence contract. The reviewer agent preloads only the common review skill; rubric selection is a deterministic runtime operation.

## Proof protocol

1. Runtime creates an immutable execute handoff with agent, skill, input refs and digests.
2. Worker returns an executable result (research packet or stage result).
3. Runtime validates result shape, producer binding and freshness.
4. Runtime creates a check handoff that references the executor run and frozen selected rubric IDs.
5. Reviewer returns a digest-bound review result.
6. Runtime validates run independence and assembles `CompletionProof`.

## Compatibility

v1/v2/v4/v5 readers remain isolated under `runtime/compat`. New six-stage code must not import legacy route/TDD workflow constants or behavior registries.
