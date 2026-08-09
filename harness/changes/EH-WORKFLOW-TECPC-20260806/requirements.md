# Requirements

## Change
- Change ID: `EH-WORKFLOW-TECPC-20260806`
- Stage: `clarify`
- Synthesized at: `2026-08-06`
- Sources consumed:
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_d4b156ea-221f-4d22-82e9-3061729bcfbe/input.json`
  - Prior durable clarify synthesis already recorded in this file before this revision
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/evidence/minimum-discovery-exploration.md`
  - `harness/changes/EH-WORKFLOW-TECPC-20260806/change.md`
  - `harness/specs/workflow.md`
  - `harness/specs/ambiguity-scoring.md`

## Clarify Phase-Boundary Calibration

### What clarify must freeze
Clarify is responsible for freezing:
- the change target
- scope and non-goals
- actors and trust boundaries
- risk/constraint posture
- acceptance intent and measurable outcomes at the requirement level
- whether user scope is confirmed

### What design must freeze
Design is responsible for freezing:
- concrete durable schemas and field-level contracts
- interface payload shapes and authoritative ownership boundaries
- error model and recovery model
- consistency/digest rules between artifacts
- migration/compatibility strategy, where applicable

### What plan must freeze
Plan is responsible for freezing:
- task breakdown
- exact commands / argv
- RED points and checker sequencing
- command-level assertions and execution receipts

### Current contract defect
The current clarify contract and scoring language partially blur phase boundaries: it can be misread as if clarify must already know design-owned schema/API/error/recovery details or plan-owned command/assertion details before route. That is the defect this synthesis corrects.

This artifact therefore does **not** claim that concrete schema fields, handoff payloads, error envelopes, recovery steps, or exact assertions are already known. It only claims that the user-confirmed intent and governance boundaries are now sharp enough for a correct handoff into route, and then into design/plan where those concrete contracts belong.

## Confirmed User Scope
The following scope is already durably recorded as user-confirmed and remains in force for this synthesis:

1. This is a breaking redesign of Enterprise Harness governance, not a compatibility-preserving incremental patch.
2. The redesign must produce complete stagewise TECPC artifacts, checkpoints, and auto-blocking rather than relying on chat discipline or reviewer habit.
3. Intake + clarify must remain inline with the user; follow-up stages use forked execution and preserve executor/checker separation.
4. Executable registration, probing, hooks, agents, and checkers are all inside the governed surface.
5. CodeGraph-first must become durably evidenced in real execution paths rather than remaining guidance-only.
6. Routing complexity must become measurable rather than qualitative.
7. Ambiguity interviewing must unify information-gain questions, Socratic contradiction testing, and Grill-Me adversarial probing inside clarify governance.
8. Compatibility requirement: `none`.
9. All durable contracts may be redesigned together, including `state.json`, handoff input/result, receipts, ledger, audit projections, and stage artifacts, provided the new contract is internally consistent, durably evidenced, recoverable, and fail-loud.

## Sharp Target
Redesign Enterprise Harness governance so that every governed stage and evidence path is mechanically executable, independently checkable, durably auditable, recoverable after failure, and fail-loud when prerequisites or evidence are missing.

## Actor Model
The actor set is sufficiently known for route and design handoff:

- **Human user**: confirms business scope and answers inline clarify questions.
- **Inline orchestrator / clarify path**: owns user dialogue, ambiguity scoring, and scope confirmation.
- **Forked stage executors**: perform stage-specific work after clarify.
- **Independent checkers**: validate stage outputs without self-review.
- **Runtime gates / hooks / probing**: enforce prerequisites, evidence emission, and fail-closed behavior.
- **Audit / doctor / workflow status consumers**: read durable artifacts to determine health, readiness, and recovery actions.
- **Evidence producers / consumers**: handoff writers, receipt writers, ledger writers, and projection readers that must agree on the new durable contract.

The remaining unknowns are not “who participates,” but the design-owned details of precedence, payload shape, and recovery semantics between these actors.

## Durable-Contract Domain
This change is explicitly about governance data contracts, even though it is not a business-SQL feature. The durable-contract domain includes:

- `state.json`
- handoff input / result artifacts
- receipts
- ledgers
- audit projections
- stage artifacts
- gating/probing evidence surfaces

Clarify now freezes **which durable domains are in scope** and the invariant that they may be redesigned together. Design must next freeze the concrete schemas, relations, digest rules, and recovery semantics across them.

## Intended Interface Boundaries
The intended interface families are known well enough for handoff, even though their exact signatures are not yet frozen:

- inline intake / clarify user-facing boundary
- forked executor input/output boundary per stage
- independent checker consumption boundary
- executable registration / probing boundary
- hooks and runtime gate boundary
- CodeGraph-attempt / receipt / ledger evidence boundary
- audit / doctor / workflow projection consumption boundary
- recovery / resume boundary for blocked or stale changes

Clarify freezes these boundary families and their intended responsibilities. Design must next define concrete payloads, authoritative source-of-truth rules, and error/recovery contracts for each boundary.

## Measurable Outcomes and Acceptance Intent
The requirement-level outcomes are now explicit:

1. Every governed stage must leave durable execute/check artifacts consistent with TECPC expectations.
2. Missing prerequisites or missing evidence must trigger automatic blocking rather than best-effort warning.
3. Inline clarify versus forked follow-up execution must be mechanically provable.
4. Registration, probing, hooks, agents, and checkers must be executable and auditable, not merely documented.
5. CodeGraph-first must leave durable receipts/evidence on real execution paths.
6. Routing complexity must produce repeatable, explainable quantitative output.
7. Ambiguity interviewing must support information-gain, Socratic contradiction testing, and Grill-Me adversarial probing within governed clarify flow.
8. The redesigned durable contract must remain internally consistent, recoverable, durably evidenced, and fail-loud.

These are acceptance **intent** and outcome constraints. Design must turn them into concrete contract assertions; plan must freeze exact commands and RED/GREEN evidence.

## Constraints and Risk Posture
- No compatibility requirement with current governance artifacts or schema shapes.
- This synthesis must not pretend that `state.json`, handoff schema, error contract, or receipt schema are already designed.
- This run must not modify `state.json`; readiness remains an artifact-level fact until later projection/check steps consume it.
- Durable evidence is authoritative; chat is not.
- Recovery and fail-loud behavior are mandatory and cannot be traded away for convenience.
- No governed product-path writes are in scope for this synthesis: `src/main/java/**`, `src/test/java/**`, `openapi/**`.

## Brownfield Facts Confirmed By Exploration
1. The current governance skeleton already spans behavior registry, handoff, workflow audit, hooks, and stage/state contracts.
2. This change previously lacked `requirements.md` and related clarify artifacts, which mechanically blocked clarify completion at that time.
3. Real evidence already showed a fail-closed WorktreeCreate problem (`EH-AGENT-FAILURE-009`) tied to parent HEAD not seeing active change state.
4. CodeGraph-first evidence is currently incomplete in practice because a durable `codegraph-attempt` ledger trail was missing from observed execution evidence.
5. Route scoring and ambiguity questioning are only partially enforced mechanically today; some guarantees still live in skills/reviewer guidance rather than runtime contracts.

## Seven-Dimension Ambiguity Scoring

Fact basis for applicability: no dimension is N/A. Although this change is not about business SQL tables, it explicitly governs durable data contracts and interface boundaries, so `Data / SQL clarity` and `Interface / API clarity` remain applicable.

| 维度 | 分数 (0-5) | 依据 |
|------|------------|------|
| T 目标 clarity | 5 | The user-confirmed target is explicit: breaking redesign of Enterprise Harness governance, with stagewise TECPC artifacts, auto-blocking, inline clarify, forked follow-up execution, executable governance surfaces, CodeGraph receipts, measurable routing, and ambiguity probing. The success direction is sharp enough for route/design handoff. |
| Scope clarity | 4 | The full durable-contract surface is explicitly in scope: `state.json`, handoff input/result, receipts, ledger, audit projections, and stage artifacts; compatibility is explicitly not required. The remaining work is route decomposition and design freezing, not additional scope discovery. |
| User / actor clarity | 4 | The participating actors and trust boundaries are now clear: user, inline orchestrator/clarify, forked executors, independent checkers, hooks/runtime gates, and audit/doctor consumers. Remaining uncertainty is about concrete precedence and recovery semantics between them, which belongs to design rather than clarify. |
| Data / SQL clarity | 3 | The governed data domain is clear and explicitly includes all durable workflow contracts, but the concrete schema, digest rules, cross-artifact consistency rules, and recovery semantics are intentionally not frozen yet. Scoring this lower does **not** mean user scope is missing; it reflects that those details are design-owned. |
| Interface / API clarity | 3 | The interface families and their intended boundaries are known, but concrete payload shapes, authoritative ownership, and error contracts are not yet frozen. Those are design-owned details, so clarify should not pretend they already exist. |
| Acceptance criteria clarity | 3 | The measurable outcomes and blocking intent are clear at requirement level, but exact assertions, thresholds, and command-level evidence are still plan/design work. Scoring this lower reflects the phase boundary, not missing business intent. |
| Constraint / risk clarity | 4 | The critical constraints and risks are explicit: no compatibility requirement, durable evidence as authority, fail-loud/recoverable invariant, no manual state projection edits, and known current defects around WorktreeCreate, CodeGraph receipts, and partial runtime enforcement. |

- Overall: `3.7`
- Weakest dimension: `Data / SQL clarity (3)`
- Weakest tie note: `Interface / API clarity` and `Acceptance criteria clarity` are also `3`. `Data / SQL clarity` is listed as the representative weakest dimension because the redesign centers on durable contract data, but all three weak scores come from the same phase-boundary issue: they are design/plan-owned details rather than unresolved user ambiguity.
- Unresolved high-risk ambiguity: `None at clarify scope level.` The remaining open items are route/design/plan decisions, not missing user confirmation.

## Handoff Interpretation
This scoring must be read carefully:

- The current artifact is **not** claiming concrete schema/API/assertion details are already known.
- The lower scores on `Data / SQL clarity`, `Interface / API clarity`, and `Acceptance criteria clarity` do **not** indicate a need for more user questioning right now.
- They instead expose a current contract defect: the clarify gate language partly expects design-owned and plan-owned detail too early.

Accordingly, the correct next move is not to grill the user for payload fields or exact argv. The correct next move is to project the confirmed scope into a route decision that preserves the phase boundary, then let design freeze concrete contracts and let plan freeze executable assertions.

## Route / Design Inputs To Carry Forward
The following items are frozen as downstream inputs and should not be re-asked as clarify questions unless route/design discovers a true contradiction:

1. **Target**: unified governance redesign across the workflow/runtime evidence system.
2. **Compatibility stance**: breaking changes allowed; compatibility is not a goal.
3. **Primary domain**: durable workflow contracts and evidence surfaces.
4. **Architecture boundary**: intake + clarify stay inline; follow-up stages remain forked with executor/checker separation.
5. **Governed surfaces**: registration, probing, hooks, agents, checkers, handoff, artifacts, receipts, ledgers, projections, doctor/audit consumption.
6. **Outcome intent**: mechanically enforced TECPC completeness, measurable routing, governed ambiguity probing, durable CodeGraph evidence, fail-loud/recoverable operation.

Downstream decisions still required:
- design the unified durable schema set and consistency model
- design authoritative boundary ownership and error/recovery semantics
- design route scoring formula and block/pass thresholds
- plan exact commands, RED points, and executable assertions

## User Confirmation Status
- Scope confirmed by user: `Yes`
- Breaking redesign allowed: `Yes`
- No-compatibility constraint confirmed: `Yes`
- All durable contracts may redesign together: `Yes`
- Clarify-owned scope/risk/acceptance intent sufficient for correct handoff: `Yes`
- Mechanical clarify-ready under the current scoring gate as written: `No` — because the current contract still conflates clarify with later design/plan detail
- Ready pending correct decision projection: `Yes`
- Runtime projection updated: `No` (this synthesis did not modify `state.json`)

## Recommended Next Single Clarify Question
- `None.` No additional user question is currently justified. The highest-information next step is a correct route/decision projection that respects the phase boundary, not another clarify round.

## Clarify Synthesis Verdict
- This artifact sharpens the requirement boundary without overclaiming design-owned detail.
- The user-confirmed scope is sufficient for route and subsequent design handoff.
- The current weak scores reflect a contract-shape defect, not unresolved business ambiguity.
- Therefore this change is `ready pending correct decision projection`, while concrete schema/interface/error/recovery design and exact assertions remain for downstream phases.
