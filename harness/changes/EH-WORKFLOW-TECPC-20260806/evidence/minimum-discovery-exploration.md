# Exploration

## Topic
Enterprise Harness governance breaking redesign for stagewise TECPC artifacts/checkpoints/auto-blocking, inline intake+clarify versus forked follow-up stages, executable registration/probing/hooks/agents/checkers, CodeGraph-first receipts, measurable routing complexity, and ambiguity interview governance.

## Date
2026-08-06

## Request Shape
Brownfield governance redesign of the Enterprise Harness workflow/runtime contracts. The user-confirmed scope is intentionally breaking, explicitly carries no compatibility requirement, and now explicitly permits a coordinated redesign of all durable contracts (`state.json`, handoff input/result, receipts, ledger, audit projections, stage artifacts), provided the new contract is internally consistent, durably evidenced, recoverable, and fail-loud.

## Candidate Tier
L1

## Owning Module / Domain / Service
Enterprise Harness governance and workflow runtime (`harness/specs/**`, `runtime/lib/**`, `runtime/hooks/**`, stage skills/agents, change artifacts/audit paths).

## Codegraph Attempt
- Status: Executed in the upstream exploration run and treated as the primary code exploration path.
- Queries:
  - Runtime governance around ambiguity scoring, router score, handoff, stage contracts, workflow audit, execution prerequisites, spawn depth, and agent evidence.
  - Call-path inspection for how clarify/route gates and evidence are enforced.
- Key Findings:
  - The current governance skeleton already exists across behavior registry, handoff, workflow audit, hooks, and state/stage contracts.
  - The current change was still missing `requirements.md` and related clarify artifacts when explored, so clarify remained mechanically blocked at that time.
  - Real execution evidence showed prior WorktreeCreate fail-closed blocking (`EH-AGENT-FAILURE-009`) caused by parent HEAD not seeing the active change state.
  - MCP CodeGraph usage did not yield a durable `codegraph-attempt` ledger entry, creating a high-confidence receipt gap against the CodeGraph-first contract.
  - Route scoring and ambiguity questioning are only partially enforced mechanically today; some guarantees still live mainly in skill/reviewer guidance rather than hard runtime gates.
- Fallback Reason: Fallback was needed only for Markdown/JSON/frontmatter/hook registration and current change ledger details that CodeGraph is not suited to inspect directly.

## Context7 / Documentation Attempt
- Library Name: N/A
- Resolved Library ID: N/A
- Version: N/A
- Query: N/A
- Key Findings: This clarify synthesis scope is confined to first-party Enterprise Harness governance contracts and current repo evidence. No external library/framework/version behavior needed to be resolved for this round.
- Fallback Reason: N/A

## Impact Summary
- API: Breaking changes are expected across harness-facing workflow contracts, clarify/route outputs, hook-visible receipts, and audit/doctor-visible evidence surfaces.
- Data: All durable governance contracts are now explicitly in scope for coordinated redesign: workflow state, handoff payloads, receipts, ledgers, audit projections, and stage artifacts.
- Architecture: Inline intake+clarify versus forked follow-up stage execution remains a central architecture boundary of the redesign.
- Rule: TECPC completeness, CodeGraph-first receipts, measurable routing complexity, and ambiguity interview probing all become governance rules rather than soft guidance.

## Unknowns
No remaining clarify-blocking unknowns remain after the latest user confirmation. The previously highest-risk ambiguity — whether all durable contracts could be redesigned together — is now resolved. Remaining open items are route/design decisions rather than clarify blockers.

## Decisions Required
- Define the new unified durable-contract model for `state.json`, handoff input/result, receipts, ledger, audit projections, and stage artifacts, including digest and consistency rules.
- Freeze the route complexity scoring model and the minimum block/pass criteria.
- Freeze the artifact/ledger contract for ambiguity probing and CodeGraph-first receipts.
- Decide whether WorktreeCreate/ACTIVE_CHANGE handling is redesigned inside this same governance change, and if so, what the recoverable fail-loud contract is.

## Confidence
High. The scope, compatibility stance, and durable-contract boundary are now user-confirmed; the remaining work is design specification rather than clarify discovery.
