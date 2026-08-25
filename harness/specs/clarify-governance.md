---
status: active
owner: enterprise-harness-maintainers
lastVerified: 2026-08-25
implementationRefs:
  - skills/harness/SKILL.md
  - harness/schemas/question-candidate.schema.json
  - harness/schemas/decision-event.schema.json
  - harness/schemas/clarify-decision-snapshot.schema.json
  - harness/schemas/debt-assessment.schema.json
  - harness/schemas/project-contract-assessment.schema.json
  - harness/schemas/classification.schema.json
  - runtime/core/decision-ledger.mjs
  - runtime/core/clarify-question.mjs
  - runtime/core/clarify-assessments.mjs
  - runtime/core/classification-artifact.mjs
  - runtime/lib/clarify-readiness.mjs
  - runtime/lib/status-summary.mjs
  - runtime/clarify.mjs
  - skills/harness/assets/debt-assessment.json.tmpl
  - skills/harness/assets/project-contract-assessment.json.tmpl
  - skills/harness/assets/research-brief.md.tmpl
  - agents/code-explore.md
  - agents/doc-research.md
  - hooks/scripts/pre-question.mjs
  - hooks/scripts/post-question.mjs
  - runtime/lib/result-contract.mjs
testRefs:
  - runtime/test/result-schema-smoke.mjs
  - runtime/test/artifact-content-smoke.mjs
  - runtime/test/docs-consistency-smoke.mjs
  - runtime/test/decision-ledger-smoke.mjs
  - runtime/test/clarify-question-smoke.mjs
  - runtime/test/clarify-question-hook-smoke.mjs
  - runtime/test/clarify-assessments-smoke.mjs
  - runtime/test/classification-v2-smoke.mjs
  - runtime/test/classification-artifact-authority-smoke.mjs
  - runtime/test/clarify-readiness-smoke.mjs
---

# Clarify Governance Contract

Clarify is the first user-visible stage in the fixed lifecycle. It completes applicable fact research before topology, scoring, or a user question; asks one user-only decision at a time; and publishes a digest-bound completion record before Design can start. Classification is a durable action within Clarify, not a stage.

## Authorities

- A schema-valid, fresh `ResearchPacket` is the authority for sourced code and external facts.
- `requirements.md` is the human-readable scope authority; it records the resolved scope and its evidence.
- The append-only decision ledger is the public history of choices. It records selections, public rationale, and evidence only; it never records prompts, messages, hidden analysis, chain of thought, or secrets.
- Debt and project-contract assessments are supporting contracts for the current change. They do not expand scope or authorise a project-instruction write.
- Classification is the derived routing authority: its digest-bound artifact records the tier and applicable impact. It is recomputed from its inputs, not manually edited.
- Readiness is a derived projection of the authoritative artifacts. It is never persisted as an editable checklist.
- The Clarify `StageResult`, independent `ReviewResult`, and `ClarifyProof` (the generic completion proof specialized to `stage: clarify`) are the completion authorities. No prior artifact alone authorizes the Design transition.

## Artifact and Gate Rules

The runtime owns safe-path validation, schema validation, digest comparison, decision-ledger append/seal behavior, and cross-record invariants. In particular, option selection must match the candidate/event option set, every debt observation has exactly one disposition, a snapshot event list is the ordered ledger prefix, and classification totals/tier/route decision agree with their inputs.

Classification v2 sums the four evidence-bearing integer scores (`functionalSize`, `uncertainty`, `changeRisk`, `verificationDifficulty`) and selects L0 for totals 0–2, L1 for 3–5, L2 for 6–8, and L3 for 9–12. Public API break, security boundary, or cross-service transaction flags can only upgrade to at least L2; irreversible data migration or unknown compliance obligation upgrades to L3. The matching append-only `classification-route` event must select the derived tier before the artifact can be persisted.

Readiness exposes the ordered in-memory projection through status. Its stable recovery range is `EH-CLARIFY-RESEARCH-131` through `EH-CLARIFY-PROOF-143`; exactly the first non-passing item supplies the recovery action. `EH-CLASSIFICATION-ROUTE-128` identifies route-event disagreement and `EH-CLASSIFICATION-STALE-129` identifies stale classification inputs.

| Blocked gate | Single recovery action |
| --- | --- |
| Required fact research is missing, invalid, stale, or degraded | Complete and persist every required fresh ResearchPacket. |
| A user-only decision remains unresolved | Prepare and resolve exactly one authorized question. |
| A relevant debt observation has no valid disposition | Record the matching debt-disposition decision and persist the assessment. |
| The project-contract audit is incomplete or conflicted | Record the matching project-contract disposition and persist the assessment. |
| The decision history is unsealed or no longer matches its prefix | Seal the ordered Clarify decision-ledger prefix. |
| Requirements or classification inputs are stale | Recompute the affected derived artifact from current authoritative inputs. |
| Self-check, independent review, TECPC, or proof is missing/stale/blocked | Re-run the Clarify completion flow and publish fresh completion evidence. |

## Invalidation

A changed or stale ResearchPacket invalidates derived requirements, assessments, question candidates, classification, readiness, and downstream Clarify completion evidence. A changed requirements artifact invalidates candidates, decisions that bind its digest, assessments, classification, readiness, and downstream completion evidence. A new decision ledger event does not mutate a previously sealed prefix, but any change to a decision included in a required prefix requires a new snapshot and invalidates its classification and completion evidence. A changed assessment or snapshot invalidates classification, readiness, and completion evidence. A changed classification invalidates readiness and completion evidence. A changed StageResult, ReviewResult, or proof invalidates only the corresponding downstream completion projection.

These invalidation edges are mechanical and digest-derived. Recovery always starts with the first blocked gate in the table; chat history and editable status flags are not recovery evidence.
