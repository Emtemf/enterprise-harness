---
status: active
owner: enterprise-harness-maintainers
lastVerified: 2026-08-26
implementationRefs:
  - skills/harness/SKILL.md
  - harness/schemas/question-candidate.schema.json
  - harness/schemas/decision-event.schema.json
  - harness/schemas/clarify-decision-snapshot.schema.json
  - harness/schemas/debt-assessment.schema.json
  - harness/schemas/project-contract-assessment.schema.json
  - harness/schemas/classification.schema.json
  - harness/schemas/stage-result.schema.json
  - harness/schemas/completion-proof.schema.json
  - runtime/core/decision-ledger.mjs
  - runtime/core/clarify-question.mjs
  - runtime/core/clarify-governance.mjs
  - runtime/core/clarify-assessments.mjs
  - runtime/core/classification-artifact.mjs
  - runtime/core/completion-proof.mjs
  - runtime/lib/clarify-readiness.mjs
  - runtime/lib/workflow.mjs
  - runtime/lib/stage-contract.mjs
  - runtime/lib/stage-results.mjs
  - runtime/lib/status-summary.mjs
  - runtime/clarify.mjs
  - runtime/lifecycle.mjs
  - skills/harness/scripts/finalize-clarify-result.mjs
  - skills/harness/assets/debt-assessment.json.tmpl
  - skills/harness/assets/project-contract-assessment.json.tmpl
  - skills/harness/assets/research-brief.md.tmpl
  - skills/harness/assets/question-candidate.json.tmpl
  - skills/harness/assets/decision-event.json.tmpl
  - skills/harness/assets/classification-input.json.tmpl
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
  - runtime/test/clarify-decision-cli-smoke.mjs
  - runtime/test/clarify-skill-contract-smoke.mjs
  - runtime/test/clarify-assessments-smoke.mjs
  - runtime/test/classification-v2-smoke.mjs
  - runtime/test/classification-artifact-authority-smoke.mjs
  - runtime/test/clarify-readiness-smoke.mjs
  - runtime/test/clarify-stage-contract-smoke.mjs
  - runtime/test/completion-proof-smoke.mjs
  - runtime/test/lifecycle-clarify-transition-smoke.mjs
  - runtime/test/workflow-audit-v6-result-smoke.mjs
  - runtime/test/result-contract-smoke.mjs
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

The runtime owns safe-path validation, schema validation, digest comparison, decision-ledger append/seal behavior, and cross-record invariants. In particular, a candidate binds its typed decision target and every evidence artifact digest; the host-visible recommended option is unique; a free-form Other response is durably redacted and cannot satisfy a typed disposition; every debt observation has exactly one disposition; a snapshot event list is the ordered ledger prefix; and classification totals/tier/route decision agree with their inputs. Public CLI commands are the supported surface for main/runtime event append, idempotent snapshot seal, and atomic classification persistence; skills do not import core modules.

A passing Clarify `StageResult` binds the current requirements, classification, debt assessment, project-contract assessment, and immutable decision snapshot together with the seven canonical Clarify assertions. Its independent review must cover that exact artifact set, and the generic completion proof specialized to `stage: clarify` binds the reviewed artifacts, sealed decision snapshot, assertion evidence, and complete TECPC. Design transition recomputes this boundary from current artifacts; neither scope confirmation nor classification alone is a completion shortcut. Appending later events to the live decision ledger does not stale an already sealed snapshot prefix or a proof bound to it.

Classification v2 sums the four evidence-bearing integer scores (`functionalSize`, `uncertainty`, `changeRisk`, `verificationDifficulty`) and selects L0 for totals 0–2, L1 for 3–5, L2 for 6–8, and L3 for 9–12. Public API break, security boundary, or cross-service transaction flags can only upgrade to at least L2; irreversible data migration or unknown compliance obligation upgrades to L3. The matching append-only `classification-route` event must select the derived tier before the artifact can be persisted.

Readiness exposes fourteen ordered, proof-free prerequisite items through status. Its stable recoveries include `EH-CLARIFY-RESEARCH-LANES-144`, `EH-CLARIFY-RESEARCH-131`, `EH-CLARIFY-RESEARCH-CONFLICTS-145`, and the ordered stage gates `EH-CLARIFY-TOPOLOGY-132` through `EH-CLARIFY-TECPC-142`; exactly the first non-passing prerequisite supplies the recovery action. `tecpc-complete` passes only when every StageResult assertion evidence ref is covered by the canonical artifacts or the TECPC evidence/context envelope and a candidate CompletionProof is derivable. When all fourteen pass, `transitionReady=true` even when no persisted proof exists. The lifecycle transition alone publishes and revalidates CompletionProof before CAS. `EH-CLASSIFICATION-ROUTE-128` identifies route-event disagreement and `EH-CLASSIFICATION-STALE-129` identifies stale classification inputs.

| Blocked gate | Single recovery action |
| --- | --- |
| Code/docs research applicability is undecided | Decide applicability for both research lanes. |
| Required fact research is missing, invalid, or stale | Complete and persist every required fresh ResearchPacket. |
| Fresh research remains degraded, conflicted, or uncertain | Dispose degraded research, conflicts, and remaining fact uncertainty. |
| A user-only decision remains unresolved | Prepare and resolve exactly one authorized question. |
| A relevant debt observation has no valid disposition | Record the matching debt-disposition decision and persist the assessment. |
| The project-contract audit is incomplete or conflicted | Record the matching project-contract disposition and persist the assessment. |
| The decision history is unsealed or no longer matches its prefix | Seal the ordered Clarify decision-ledger prefix. |
| Requirements or classification inputs are stale | Recompute the affected derived artifact from current authoritative inputs. |
| Self-check, independent review, or TECPC is missing/stale/blocked | Re-run the Clarify completion flow and publish fresh prerequisite evidence. |
| Transition-owned proof publication or immediate revalidation fails | Stay in Clarify and retry the lifecycle transition after repairing the reported failure. |

## Invalidation

A changed or stale ResearchPacket invalidates derived requirements, assessments, question candidates, classification, readiness, and downstream Clarify completion evidence. A changed requirements artifact invalidates candidates, decisions that bind its digest, assessments, classification, readiness, and downstream completion evidence. A new decision ledger event does not mutate a previously sealed prefix, but any change to a decision included in a required prefix requires a new snapshot and invalidates its classification and completion evidence. A changed assessment or snapshot invalidates classification, readiness, and completion evidence. A changed classification invalidates readiness and completion evidence. A changed StageResult, ReviewResult, or proof invalidates only the corresponding downstream completion projection.

These invalidation edges are mechanical and digest-derived. Recovery always starts with the first blocked gate in the table; chat history and editable status flags are not recovery evidence.
