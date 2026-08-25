# Clarify Output Contract

Read this contract when entering Clarify and before final self-check. It defines semantic quality; runtime schemas and
validators remain the structural and freshness authorities. Use the canonical schemas rather than reproducing them:
[question candidate](../../../harness/schemas/question-candidate.schema.json),
[decision event](../../../harness/schemas/decision-event.schema.json),
[debt assessment](../../../harness/schemas/debt-assessment.schema.json),
[project-contract assessment](../../../harness/schemas/project-contract-assessment.schema.json),
[classification](../../../harness/schemas/classification.schema.json), and
[completion proof](../../../harness/schemas/completion-proof.schema.json).

## Semantic expectations

| Concern | Passing output |
|---|---|
| Lane applicability | Code and docs are each decided from observable change characteristics. `not-required` includes evidence and is recorded as a durable decision, not a convenience default. |
| Brief quality | Each immutable brief asks one lane-answerable fact question, bounds scope and exclusions, preserves only known user facts, and binds the source request. |
| Fact sufficiency | Every required lane has a validated, canonical, fresh ResearchPacket. Degraded, conflicting, or uncertain facts are explicitly disposed before topology or scoring. |
| Topology | Components are evidence-derived, independently successful/failing user outcomes. Files, fields, implementation steps, and risk surfaces are not promoted to components. Add/remove/merge/split/defer remains user-authorized. |
| Five dimensions | Goal, Scope, Constraints, Acceptance, and Context are computed from predicate-level evidence. Score 4 means all predicates are covered; score 5 also has explicit confirmation. |
| Question value | One current weakest/highest-risk user-only Decision is selected. The candidate explains consequences, has mutually exclusive options, a supported recommendation, evidence refs, and a plausible score delta. Facts are never disguised as questions. |
| Debt relevance | Only debt directly touched by the approved change, with location or execution evidence and material impact, is assessed. Repository-wide or unrelated cleanup is excluded. Every relevant observation has one disposition. |
| Project contract | Existing instruction files are inventoried by ref/digest. Complete contracts are reused; gaps produce a proposal ref; conflicts or deferral require a public user Decision. Assessment never writes project instructions. |
| Classification evidence | Classification is recomputed from fresh requirements, assessments, decision snapshot, and required packets; its route event matches the derived tier and impact. |
| Self-check | The Main-produced StageResult binds the exact five canonical Clarify artifacts, current inputs, required assertions, and a passing self-check. It reports the first recovery when blocked. |
| Independent review | The reviewer has a distinct identity/run, consumes the immutable artifact set, checks fact gates, omissions, conflicts, scope creep, acceptance, and premature design, and emits a fresh verdict. |
| Proof | TECPC has target, evidence, context, path, and no pending correction. ClarifyProof binds the reviewed digests, sealed decision prefix, assertions, execution/review identities, and freshness required for Design transition. |

## Authority and mutability

The append-only Decision Ledger is mutable by addition and is the public history of selections, rationale, and evidence.
It contains no transcript or hidden reasoning. The Clarify decision snapshot is an immutable sealed prefix; appending a
later ledger event does not rewrite it. Requirements and assessments are working artifacts until completion, whereas
StageResult, ReviewResult, snapshot, and ClarifyProof are digest-bound completion evidence. Hooks only authorize and
record a host event; they do not score ambiguity, choose a product option, or decide readiness.

## Self-check questions

1. Did all applicable fact work become durable before the first candidate was prepared?
2. Does every open item have exactly one owner: agent for Fact, user for Decision?
3. Would removing an evidence ref lower the exact predicate or invalidate the decision it supports?
4. Is the current action the single recovery returned by status/recover?
5. Can the independent reviewer reproduce the completion boundary without chat context?
