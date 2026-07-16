# Open Issues Matrix

## Purpose

Record the current open issue landscape as explicit evidence for how `clarify-first-staged-orchestrator` fits into the broader roadmap, and ensure README/PROGRESS alignment is grounded in actual issue review rather than memory.

## Reviewed open issues

### #20 — Orchestration: single human entrypoint / automation-first lifecycle runner
- Focus: make `/harness` the only human-facing workflow entrypoint while preserving lower-level commands as internal/runtime APIs.
- Relevance: **direct parent/adjacent scope** for the current change.
- Current mapping: this change already implements the first contract/template/worker/guidance/smoke skeleton for this direction, but full deterministic lifecycle runner behavior remains future work.

### #8 — Gate hardening: tighten design, plan, RED, and validation gates
- Focus: turn current gate concepts into harder-to-bypass, more mechanical gates.
- Relevance: **directly coupled** to the current change.
- Current mapping: this change absorbs #8’s direction into clarify-first orchestration, staged workflow, machine-readable workflow state, and stronger task/TDD/verify boundaries, but #8 still owns deeper runtime gate hardening and mutation-path coverage.

### #11 — Gate hardening: make design/plan/task gates explicit and enforceable
- Focus: make design/plan/task readiness more explicit and machine-consumable.
- Relevance: **directly coupled** to the current change.
- Current mapping: this change turns the issue’s design/plan/task readiness concerns into staged workflow artifacts, workflow state, and subordinate stage skills. #11 remains the narrower gate-hardening slice inside the broader orchestrator track.

### #9 — Java golden sample: strengthen reference-service as a real backend sample
- Focus: turn `reference-service` from structural demo into a stronger mechanical quality profile.
- Relevance: **parallel track**.
- Current mapping: not directly implemented here; the current change only defines orchestration/gate structure that later Java quality work should plug into.

### #12 — Java golden sample: add ArchUnit and coverage gates to reference-service
- Focus: ArchUnit, JaCoCo 85%, stronger mechanical Java checks.
- Relevance: **parallel track / downstream dependency**.
- Current mapping: not directly implemented here; staged workflow and `verify` should become the place where future Java quality evidence is consumed.

### #10 — Runtime productization: improve installer, adapter schema, and cross-platform verification
- Focus: onboarding, migration, cross-platform confidence, runtime packaging.
- Relevance: **parallel but downstream-related track**.
- Current mapping: not directly implemented here, except that this change keeps runtime commands as backend APIs and clarifies their relation to `/harness`.

### #13 — Runtime productization: tighten local adapter schema and installer diagnostics
- Focus: make local adapter a stronger execution/recovery contract.
- Relevance: **parallel but downstream-related track**.
- Current mapping: not directly implemented here; the current change keeps adapter/runtime as a backend layer and expects future adapter work to support the orchestrator.

### #15 — Release: add local source-external release smoke path
- Focus: source-external release smoke and release-local confidence.
- Relevance: **separate release/distribution track**.
- Current mapping: not directly implemented here; only README/roadmap alignment reflects that #15 remains open and belongs to runtime/distribution productization.

### #7 — Roadmap parent issue
- Focus: umbrella milestone for gate hardening, Java golden sample, and runtime productization.
- Relevance: **top-level parent roadmap**.
- Current mapping: current change should be read as the first major skeleton for the orchestration branch now referenced by #20 and connected to #8/#11.

## Summary mapping

| Issue | Theme | Relationship to current change |
|---|---|---|
| #20 | Orchestration | Primary adjacent/parent scope |
| #8 | Gate hardening | Directly coupled |
| #11 | Design/plan/task gate explicitness | Directly coupled |
| #9 | Java golden sample | Parallel track |
| #12 | Java mechanical quality gates | Parallel track |
| #10 | Runtime productization | Parallel/downstream |
| #13 | Adapter schema & diagnostics | Parallel/downstream |
| #15 | Release/local smoke | Separate release track |
| #7 | Roadmap umbrella | Parent roadmap |

## Consequence for README / PROGRESS

- README should describe the current project as already on the clarify-first staged orchestrator path, while explicitly mapping it to #20 + #8/#11.
- PROGRESS should reflect that the current active change is `clarify-first-staged-orchestrator`, and that future work fans out into Java golden sample (#9/#12) and runtime/distribution productization (#10/#13/#15).

## Conclusion

All currently open issues have been reviewed at least to the level needed to place the current change into the global roadmap. The active implementation focus remains the orchestration/gate branch (`#20 + #8/#11`), while Java quality and runtime/distribution remain parallel next-phase tracks.
