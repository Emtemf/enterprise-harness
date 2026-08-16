# Target Architecture

## Responsibility boundaries

```text
Main Harness
  user decisions, orchestration, recovery
      │
      ├── Skill (method + references + deterministic helper scripts)
      │      └── explicit capability Agent (isolated context/tools)
      │              └── StageResult or ResearchPacket
      │
      ├── reviewer + review Skill (fresh isolated context)
      │      └── ReviewResult
      │
      └── Runtime
             validates digests, freshness, independence and transition
             emits CompletionProof
```

## Fact lanes

- `code-explore` is read-only, CodeGraph-first, and returns a compressed `ResearchPacket`.
- `doc-research` is read-only, Context7-first, and returns a compressed `ResearchPacket` with library/version/source provenance.
- Facts are not business decisions. Workers return `NEEDS_DECISION`; only Main asks the user.

## Quality model

For each stage or implementation task:

```text
execute → explicit self-check → fresh independent review → runtime CompletionProof → transition
```

`StageResult` contains execution, mechanical assertions and a semantic `selfCheck`. `ReviewResult` contains only the independently reviewed run, rubric selection, verdict, correction and artifact bindings. Runtime alone creates the proof that joins them; neither executor nor reviewer self-certifies completion.

## State model

State stores lifecycle location, revision/CAS information, current task and artifact pointers/digests. Classification and impact remain authoritative in `classification.json`; state holds only its reference/digest. Readiness/approval flags are derived.

## Hook model

Hooks are limited to host-bound concerns: startup health/recovery notice, scoped write protection where needed, safe dispatch marker validation, and research audit telemetry. Workflow sequencing, artifact interpretation and semantic gating live in skills/runtime.
