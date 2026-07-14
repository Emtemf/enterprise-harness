# Enterprise Java Microservice Harness Blueprint

## 1. Overview

### Goal

Build an enterprise-ready harness blueprint for Java microservice teams that standardizes the delivery flow from requirement intake through analysis, design, planning, TDD execution, review, verification, and artifact archival.

The blueprint must be:

- **Reusable across many service repositories** in a multi-repo microservice environment
- **Governable** through shared rules, hooks, and reviewer agents
- **Auditable** through durable on-disk artifacts under a custom `harness/` directory
- **Practical** for Java service teams using Clean Architecture / DDD-style layering
- **Incrementally adoptable** with recommended defaults and a small set of hard gates

### First-phase objective

Phase 1 focuses on **R&D workflow standardization**, not on building a fully autonomous enterprise AI platform.

The first deliverable is a dual-track system:

1. A **platform governance repository** that distributes the standard flow, rules, hooks, templates, and reviewer definitions
2. A **Java reference service** that proves the end-to-end workflow works in a real service repository

## 2. Design principles

### 2.1 Superpowers as workflow engine

Use the Superpowers-style workflow as the process backbone:

- Brainstorming before implementation
- Incremental design validation with user approval
- Detailed planning before coding
- Subagent-driven execution
- TDD as the implementation discipline
- Review and verification before considering work complete

Superpowers is used for **how work moves forward**.

### 2.2 OpenSpec-like artifact model without OpenSpec branding

Borrow the artifact organization ideas from OpenSpec, but do not use `openspec/` as the literal folder name.

Instead, all enterprise artifacts live under a custom visible directory:

```text
harness/
```

The harness directory is the durable work and audit space for service repositories.

### 2.3 Platform baseline + service-local extension

The platform governance repository defines the enterprise baseline.
Service repositories may extend or parameterize that baseline, but they must not silently weaken hard gates.

### 2.4 Default recommendation + key hard gates

The system should not start as a high-friction fully locked pipeline.
Instead, it should provide strong defaults and enforce only the most valuable gates in phase 1.

### 2.5 Productive before ambitious

The blueprint must optimize for a reliable first rollout:

- one Java service repository
- one real end-to-end requirement
- one full artifact trail
- one working standard flow

Cross-service orchestration, advanced dashboards, and heavy automation can follow later.

## 3. Target scope

### In scope

- Java microservices in a multi-repo enterprise environment
- Platform governance repository + service onboarding model
- Requirement analysis with codegraph-first guidance
- Superpowers-style brainstorming, design, planning, and execution flow
- Clean Architecture / DDD-inspired layering guidance
- OpenAPI / YAML governance and controller consistency checks
- TDD with both mock-based unit tests and local DB-backed small integration tests
- Durable artifacts for exploration, work slices, changes, and stable specs

### Out of scope for phase 1

- Fully autonomous no-human-confirmation execution
- Cross-service orchestration as a mandatory flow
- Organization-wide dashboards and scoring systems
- Full-blown internal CLI installer
- Exhaustive reviewer gate expansion beyond the minimal hard-gate set

## 4. Enterprise architecture

The solution has three cooperating layers.

### 4.1 Workflow layer

This layer governs the sequence of work:

- requirement intake
- code analysis and exploration
- brainstorming and scope clarification
- design production and review
- implementation plan production and review
- subagent execution with TDD
- verification and archival

This layer is inspired by Superpowers and defines **how work progresses**.

### 4.2 Artifact layer

This layer persists the work to disk in a stable, auditable way under `harness/`.

It defines:

- where exploration notes live
- where active work slices live
- where formal change proposals live
- where long-lived stable specifications live

This layer defines **where the evidence and artifacts live**.

### 4.3 Governance layer

This layer is the enterprise policy layer and is made of:

- `CLAUDE.md`
- `rules/`
- `hooks/`
- reviewer agent definitions

This layer defines **what is required**, **what is forbidden**, and **which checkpoints are mandatory**.

## 5. Repository model

The blueprint uses a **platform governance repository + many service repositories** model.

### 5.1 Platform governance repository responsibilities

The platform repository is the control plane. It owns:

- enterprise `CLAUDE.md` baseline
- shared `rules/`
- shared `hooks/`
- reviewer/critic agent definitions
- `harness/` skeleton and templates
- service onboarding assets
- reference Java service

The platform repository defines the standard but does not contain service-specific business implementation.

### 5.2 Service repository responsibilities

Each service repository is the execution plane. It owns:

- service-specific `harness/` artifacts
- service-specific hook parameters
- service-specific rule additions
- business code and tests
- local exception declarations when temporary waivers are required

A service may strengthen the baseline but should not quietly weaken enterprise hard gates.

## 6. Recommended repository structure

### 6.1 Platform governance repository

```text
platform-governance/
  CLAUDE.md
  rules/
    architecture.md
    code-analysis.md
    testing.md
    api-contract.md
    workflow.md
    review.md
  hooks/
    validate-openapi.sh
    validate-controller-consistency.sh
    validate-spec-structure.sh
  agents/
    requirement-reviewer.md
    design-reviewer.md
    plan-critic.md
    api-consistency-reviewer.md
    verification-reviewer.md
    architecture-advisor.md
    test-design-advisor.md
    rollout-advisor.md
  harness/
    config.yaml
    initiatives/
    explorations/
    specs/
    changes/
    work/
  service-onboarding/
    bootstrap/
    sync/
    upgrade/
  reference-service/
```

### 6.2 Service repository

```text
service-repo/
  CLAUDE.md
  rules/
  hooks/
  harness/
    config.yaml
    initiatives/
    explorations/
    specs/
    changes/
    work/
  src/
  test/
```

## 7. Harness directory design

The custom visible `harness/` directory borrows OpenSpec-like organization but uses enterprise-specific naming.

```text
harness/
  config.yaml
  initiatives/
  explorations/
  specs/
  changes/
  work/
```

### 7.1 `config.yaml`

`config.yaml` stores the service-level harness context, such as:

- domain terminology conventions
- default reviewer parameters
- OpenAPI file location
- controller scan package
- test strategy declarations
- optional service-specific defaults for artifact generation

### 7.2 `initiatives/`

`initiatives/` stores medium- to long-lived work themes such as:

- order domain refactor
- settlement workflow standardization
- API governance improvement

This directory answers: **why are we doing this family of work?**

### 7.3 `explorations/`

`explorations/` stores analysis artifacts produced before implementation begins.
These can include:

- codegraph impact analysis
- current module boundary analysis
- dependency scans
- legacy table or API investigation

This directory is especially important for requirement intake and scoping.

### 7.4 `work/`

`work/` stores active execution slices.
It is the highest-frequency working area during normal delivery.

### 7.5 `changes/`

`changes/` stores formal change proposals and spec deltas when a work slice becomes a durable product or capability change.

### 7.6 `specs/`

`specs/` stores stable, current specifications that remain valid after the work finishes.

## 8. Naming conventions

### 8.1 Exploration files

Exploration materials use:

```text
YYYY-MM-DD-topic-artifact-type.md
```

Examples:

```text
harness/explorations/2026-07-03-order-batch-cancel-impact.md
harness/explorations/2026-07-03-order-batch-cancel-api-diff.md
harness/explorations/2026-07-03-order-batch-cancel-upstream-deps.md
```

Reasoning:

- preserves chronology clearly
- supports multiple analysis outputs for one requirement
- makes search and audits easier

### 8.2 Work IDs

Work directories use stable semantic IDs without dates:

```text
harness/work/order-batch-cancel/
```

Slices under work also use stable semantic IDs:

```text
harness/work/order-batch-cancel/slices/add-batch-cancel-api/
```

### 8.3 Change IDs

Formal changes use action-oriented identifiers:

```text
harness/changes/add-order-batch-cancel/
```

### 8.4 Stable specs

Stable specs use domain or capability names:

```text
harness/specs/order-api/
harness/specs/order-cancellation/
```

## 9. Work artifact model

The recommended work model is:

```text
goal -> roadmap -> slice -> result
```

### 9.1 Work directory shape

```text
harness/work/
  <work-id>/
    goal.md
    roadmap.md
    slices/
      <slice-id>/
        spec.md
        plan.md
        result.md
        log.md   # optional
```

### 9.2 Artifact responsibilities

- `goal.md` explains the destination and business reason
- `roadmap.md` explains the expected sequence of slices and can evolve
- `spec.md` defines what must become true for one slice
- `plan.md` defines how the slice will be implemented and verified
- `result.md` records what actually happened and the evidence
- `log.md` is optional and only used when a meaningful pivot needs explanation

### 9.3 Revision rules

- edit `spec.md` when the intended outcome changes
- edit `plan.md` when the implementation path changes but the outcome stays the same
- update `result.md` when implementation or verification occurs
- create a new slice when work can be accepted, implemented, verified, or shipped independently

## 10. Formal change model

When a work slice becomes a formal product, capability, or contract change, project it into:

```text
harness/changes/
  <change-id>/
    proposal.md
    specs/
```

This is the formal proposal and specification delta track.

### Recommended responsibilities

- `proposal.md` explains the why, scope, intended change, and rollout context
- `specs/` contains the stable deltas to the applicable capability or domain specs

After acceptance and implementation, the stable state is represented in `harness/specs/`.

## 11. End-to-end workflow

The delivery chain should follow a **single-entry, multi-gate, dual-track archival** model.

### 11.1 Requirement intake

The process begins with a natural-language requirement from a human.

The system must not immediately write code.
It first performs context discovery:

- identify the service or candidate services affected
- identify candidate modules
- identify related APIs
- identify related domain objects and data structures
- identify likely upstream and downstream impacts

### 11.2 Code analysis and exploration

For Java service repositories, code analysis should default to **codegraph-first** exploration.

The initial exploration should identify:

- controllers
- application services
- domain services / aggregates / repositories
- DTOs / entities / mappers
- relevant call paths and likely impact areas

The output of this stage should be persisted under `harness/explorations/`.

### 11.3 Brainstorming and scoping

After initial exploration, the controller agent follows a Superpowers-style brainstorming flow:

- ask one question at a time
- clarify goal, constraints, and success criteria
- determine whether the work is single-service or cross-service
- determine whether the work should be split into multiple slices

The outcome of this stage becomes the initial work slice `spec.md`.

### 11.4 Requirement review gate

The `requirement-reviewer` validates:

- whether the requirement belongs in the candidate service or module
- whether it violates or stretches service responsibility boundaries
- whether key upstream/downstream impacts are missing
- whether the work is too large for one slice

If it fails, the requirement returns to clarification.
If it passes, the slice proceeds.

### 11.5 Design stage

The design artifact must include, when applicable:

- interface design
- data or table design
- impacted architectural layers
- error handling approach
- testing strategy

This design is reviewed before planning begins.

### 11.6 Design review gate

The `design-reviewer` validates:

- alignment with the approved requirement
- alignment with architectural boundaries
- completeness of interface and data design where relevant
- compatibility with existing API and data models
- presence of a real testing strategy

### 11.7 Planning stage

Once the design is approved, `writing-plans` generates a detailed plan.

The plan must be:

- decomposed into independent tasks where possible
- explicit about files and interfaces
- explicit about tests and verification steps
- free of placeholders or vague steps
- compatible with TDD execution

### 11.8 Plan review gate

The `plan-critic` validates:

- task independence and size
- cross-task interface clarity
- TDD readiness
- explicit verification steps
- absence of placeholders, TODOs, and ambiguous language

### 11.9 Execution stage

Execution uses:

- subagent-driven development
- worktree isolation when appropriate
- TDD discipline

Each task should follow:

- failing test first
- minimal implementation
- passing test verification
- refactor when justified
- task-level review

### 11.10 Verification stage

Before completion, the system must verify:

- OpenAPI / YAML validity where relevant
- controller / API contract consistency
- mock unit test coverage for critical logic
- local DB-backed integration test coverage for persistence-related paths
- durable result evidence in `result.md`

### 11.11 Formalization and archival

If the slice changes a long-lived product contract or capability, project it into `harness/changes/<change-id>/` and update the stable material in `harness/specs/`.

## 12. Reviewer agent system

Reviewer agents are divided into **hard-gate reviewers** and **soft-gate advisors**.

### 12.1 Hard-gate reviewers

These block progress when they fail.

#### `requirement-reviewer`

Checks:

- requirement-to-service fit
- module ownership correctness
- slice size reasonableness
- missing upstream/downstream impacts

Why hard gate:

- bad scope early poisons all downstream work

#### `design-reviewer`

Checks:

- requirement coverage
- interface/data/layer/test completeness
- Clean Architecture or DDD boundary compliance
- conflict with existing APIs or data structures

Why hard gate:

- a wrong design invalidates the plan and implementation

#### `plan-critic`

Checks:

- task decomposition quality
- TDD suitability
- test and verification clarity
- cross-task interface definition
- no placeholders or vague steps

Why hard gate:

- subagent quality depends directly on plan quality

#### `api-consistency-reviewer`

Checks:

- OpenAPI / YAML validity
- controller-to-YAML alignment
- request/response contract drift
- breakage in generation or sync pipeline

Why hard gate:

- contract drift is a high-value enterprise defect to prevent early

#### `verification-reviewer`

Checks:

- required tests were actually run
- unit tests cover critical branches
- local DB integration tests cover key persistence paths
- `result.md` contains proof and follow-up notes

Why hard gate:

- completion must be evidence-based

### 12.2 Soft-gate advisors

These provide recommendations without blocking phase 1 by default.

#### `architecture-advisor`

Focus:

- better layering
- smaller file boundaries
- reuse opportunities

#### `test-design-advisor`

Focus:

- missing edge cases
- exception-path coverage
- better balance between mocks and integration tests

#### `rollout-advisor`

Focus:

- phased rollout considerations
- feature flags
- release-order concerns across services

### 12.3 Phase-1 hard-gate set

Phase 1 should enforce only these five hard gates:

1. requirement correctness
2. design completeness and architecture fit
3. plan executability and clarity
4. API contract consistency
5. verification evidence

## 13. Codegraph, API, architecture, and testing integration

These four capabilities should be embedded into different workflow stages rather than treated as disconnected rules.

### 13.1 Codegraph

Codegraph is the default analysis tool immediately after requirement intake.

Its responsibilities are:

- establish current system context
- find the likely implementation surface
- support impact analysis
- support reviewer reasoning for scope and design

### 13.2 OpenAPI / YAML

OpenAPI is both a design input and a verification gate.

When an interface changes, design must define:

- path and operation
- request/response contract
- error contract
- compatibility expectation

Verification must then confirm:

- YAML is valid
- controller matches the contract
- generation or sync flows remain intact

### 13.3 Clean Architecture / DDD-style layering

Layer boundaries should be enforced through rules and review, not only through developer intent.

Expected layering:

- interface layer: controllers, transport DTO mapping, external boundary adapters
- application layer: orchestration, use-case coordination
- domain layer: business rules, aggregates, domain services, policies
- infrastructure layer: database, messaging, HTTP clients, storage adapters

Design must state which layers are affected.
Plan tasks must state which layer they touch.
Review must detect cross-layer leakage.

### 13.4 Testing system

Testing begins in the plan, not after coding.

Each slice plan must describe:

- mock-based unit tests
- local DB-backed small integration tests
- contract checks where applicable
- critical exception-path verification

Execution must follow true RED-GREEN-REFACTOR discipline.
Verification evidence must be written into `result.md`.

## 14. Platform-controlled vs service-local assets

### 14.1 Platform-controlled assets

The platform repository should centrally distribute:

- workflow baseline in `CLAUDE.md`
- baseline rules
- generic hooks
- reviewer and advisor definitions
- `harness/` skeleton templates
- document templates

These define the enterprise standard and should remain centrally governed.

### 14.2 Service-local assets

Each service repository should own:

- service-specific business artifacts in `harness/`
- hook parameters such as package paths and OpenAPI file locations
- service-specific rule extensions
- temporary waiver declarations where necessary

### 14.3 Override model

Recommended override model:

1. platform baseline: required everywhere
2. service enhancement: may tighten or extend
3. waiver list: must be explicit and auditable

Services should not silently drift from the platform baseline.

## 15. Example requirement artifact trail

Example requirement:

> Add a batch-cancel endpoint to the order service and preserve complete audit logs.

Expected artifact trail:

### Exploration

```text
harness/explorations/2026-07-03-order-batch-cancel-impact.md
```

### Active work

```text
harness/work/order-batch-cancel/
  goal.md
  roadmap.md
  slices/
    add-batch-cancel-api/
      spec.md
      plan.md
      result.md
```

### Formal change

```text
harness/changes/add-order-batch-cancel/
  proposal.md
  specs/
```

### Stable state

```text
harness/specs/order-api/
harness/specs/order-cancellation/
```

## 16. Phase-1 MVP

Phase 1 should deliver the smallest meaningful standardization loop.

### 16.1 Must-have capabilities

- platform governance repository skeleton
- Java reference service
- end-to-end requirement-to-result workflow
- codegraph-first exploration for Java repositories
- hard API consistency gate
- mock unit tests + local DB small integration tests
- durable artifact generation under `harness/`

### 16.2 Explicit non-goals for phase 1

Do not overbuild phase 1 with:

- fully autonomous no-confirmation operation
- mandatory cross-service orchestration
- internal enterprise installer CLI
- organization-level dashboards
- excessive hard-gate reviewer expansion

### 16.3 Phase-1 acceptance criteria

A successful phase 1 can:

1. take a real requirement in a Java service repository
2. generate codegraph-based exploration output
3. produce and review a slice `spec.md`
4. produce and review a `plan.md`
5. execute implementation through subagents with TDD
6. run unit and DB-backed integration tests
7. verify OpenAPI/controller consistency
8. produce a `result.md`
9. formalize durable changes in `harness/changes/` and `harness/specs/` when needed

## 17. Risks and mitigations

### Risk: gate overload hurts adoption

Mitigation:

- start with recommended defaults
- enforce only the minimal hard-gate set
- keep advisory reviews non-blocking in phase 1

### Risk: services diverge from the platform standard

Mitigation:

- centralize baseline templates and hooks
- require explicit waivers for deviations
- keep service-level configuration parameterized instead of forked

### Risk: artifact process becomes documentation theater

Mitigation:

- require codegraph exploration to connect artifacts to real code
- require TDD execution and verification evidence
- require `result.md` proof before completion

### Risk: API governance becomes disconnected from implementation

Mitigation:

- make OpenAPI part of design inputs
- enforce controller/YAML consistency with hooks and review
- include contract checks before acceptance

## 18. Recommendation

Adopt the blueprint as follows:

- use Superpowers-style process for orchestration
- use a custom visible `harness/` directory for artifact persistence
- use `CLAUDE.md`, `rules/`, `hooks/`, and reviewer agents for governance
- prove the model in one Java reference service before scaling to many repositories

In short:

> Use Superpowers for workflow, OpenSpec-like artifact thinking for structure, and enterprise-specific `harness/` conventions for durable governance in Java microservice repositories.
