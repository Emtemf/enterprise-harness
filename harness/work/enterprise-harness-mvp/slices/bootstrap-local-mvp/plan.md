# Enterprise Harness MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local inspectable MVP of the enterprise Java microservice harness blueprint, including governance files, hook wiring, harness artifacts, and a runnable Java reference service with OpenAPI and test coverage.

**Architecture:** This MVP has two deliverables in one workspace: a governance skeleton at the repo root and a small Spring Boot reference service under `reference-service/`. The governance skeleton demonstrates `CLAUDE.md`, `rules/`, `hooks/`, `agents/`, `harness/`, and `.claude/settings.json`, while the reference service demonstrates clean layers, OpenAPI ownership, unit tests, and local DB-backed integration tests.

**Tech Stack:** Claude Code local project files, shell hook scripts, JSON settings, YAML config, Java 21, Maven 3.8.7, Spring Boot 3.x, springdoc OpenAPI, JUnit 5, Mockito, H2.

## Global Constraints

- Reusable across many service repositories in a multi-repo microservice environment.
- Governable through shared rules, hooks, and reviewer agents.
- Auditable through durable on-disk artifacts under a custom `harness/` directory.
- Practical for Java service teams using Clean Architecture / DDD-style layering.
- Incrementally adoptable with recommended defaults and a small set of hard gates.
- Phase 1 focuses on R&D workflow standardization, not on building a fully autonomous enterprise AI platform.
- For Java service repositories, code analysis should default to codegraph-first exploration.
- OpenAPI / YAML governance and controller consistency checks are in scope.
- TDD with both mock-based unit tests and local DB-backed small integration tests is in scope.
- The custom visible artifact root is `harness/`, not `openspec/`.
- Exploration files use `YYYY-MM-DD-topic-artifact-type.md` naming.
- Work directories use stable semantic IDs without dates.
- Formal changes use action-oriented identifiers.
- The phase-1 hard-gate set is: requirement correctness, design completeness and architecture fit, plan executability and clarity, API contract consistency, and verification evidence.
- Services may extend or parameterize the platform baseline, but they must not silently weaken hard gates.
- Because this workspace is not a git repository, commit steps are not executable in this MVP and should be recorded as skipped rather than attempted.

---

## File Structure

### Governance / harness skeleton

- Create: `/home/wula/IdeaProjects/sdd/CLAUDE.md`
  - Root governance summary that points to `rules/`, `hooks/`, `agents/`, `harness/`, and the reference service.
- Create: `/home/wula/IdeaProjects/sdd/.claude/settings.json`
  - Project-level Claude Code settings with hook registration for local validation.
- Modify: `/home/wula/IdeaProjects/sdd/.claude/settings.local.json`
  - Keep plugin enablement intact; do not remove the existing Superpowers plugin setting.
- Create: `/home/wula/IdeaProjects/sdd/rules/architecture.md`
  - Clean Architecture / DDD layer constraints for Java services.
- Create: `/home/wula/IdeaProjects/sdd/rules/code-analysis.md`
  - Codegraph-first analysis rule and conventions.
- Create: `/home/wula/IdeaProjects/sdd/rules/testing.md`
  - TDD, unit-test, and local DB integration-test requirements.
- Create: `/home/wula/IdeaProjects/sdd/rules/api-contract.md`
  - OpenAPI / YAML ownership and controller consistency rules.
- Create: `/home/wula/IdeaProjects/sdd/rules/workflow.md`
  - Brainstorming → design → plan → TDD → verify lifecycle summary.
- Create: `/home/wula/IdeaProjects/sdd/rules/review.md`
  - Reviewer responsibilities and hard-gate list.
- Create: `/home/wula/IdeaProjects/sdd/hooks/validate-spec-structure.sh`
  - Validate required `harness/` directories and files.
- Create: `/home/wula/IdeaProjects/sdd/hooks/validate-openapi.sh`
  - Validate OpenAPI YAML syntax and required high-level sections.
- Create: `/home/wula/IdeaProjects/sdd/hooks/validate-controller-consistency.sh`
  - Compare reference-service controller path/method markers to YAML path/method markers.
- Create: `/home/wula/IdeaProjects/sdd/agents/requirement-reviewer.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/design-reviewer.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/plan-critic.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/api-consistency-reviewer.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/verification-reviewer.md`
  - Minimal reviewer role prompts for the hard-gate set.
- Create: `/home/wula/IdeaProjects/sdd/harness/config.yaml`
  - Workspace-level harness defaults.
- Create: `/home/wula/IdeaProjects/sdd/harness/explorations/2026-07-03-mvp-bootstrap-impact.md`
  - Example exploration artifact.
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/goal.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/roadmap.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/spec.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/plan.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/result.md`
  - Example live work slice for this MVP.
- Create: `/home/wula/IdeaProjects/sdd/harness/changes/add-enterprise-harness-mvp/proposal.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/changes/add-enterprise-harness-mvp/specs/mvp-scope.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/specs/mvp-governance.md`
  - Example change/proposal/stable-spec artifacts.

### Java reference service

- Create: `/home/wula/IdeaProjects/sdd/reference-service/pom.xml`
  - Maven build with Spring Boot, validation, JPA, H2, tests, and springdoc.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/ReferenceServiceApplication.java`
  - Spring Boot entry point.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
  - Interface-layer REST controller.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/CancelOrderUseCase.java`
  - Application-layer orchestration interface.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/OrderCancellationService.java`
  - Application-layer implementation.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/OrderCancellationPolicy.java`
  - Domain-layer rule class.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/OrderStatus.java`
  - Domain enum.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/OrderRecord.java`
  - Domain model for cancellation path.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/OrderEntity.java`
  - JPA entity.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/OrderJpaRepository.java`
  - Spring Data repository.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/OrderRepository.java`
  - Infrastructure repository adapter interface for app layer.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/JpaOrderRepository.java`
  - Infrastructure adapter implementation.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderRequest.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderResponse.java`
  - Transport DTOs.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/resources/application.yml`
  - App config.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/resources/db/migration-notes.md`
  - Simple placeholder doc describing the in-memory local DB purpose for the MVP.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/openapi/order-service.yaml`
  - Owned OpenAPI file for the reference endpoint.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/application/OrderCancellationServiceTest.java`
  - Mock-based unit test.
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`
  - H2-backed integration test hitting the controller.

## Task Right-Sizing Notes

This MVP is intentionally limited to one governance skeleton and one vertical reference feature (`cancel order`) so that the result is inspectable, runnable, and testable without expanding into multi-service orchestration or full enterprise automation.

## Execution Notes

- This workspace is **not a git repository**, so no task should attempt `git add` or `git commit`.
- Worktree creation is not available here because there is no git repository.
- Java 21 and Maven 3.8.7 are present, so the reference service should be verified with Maven tests.

## Task Outline

### Task 1: Create governance and harness skeleton

**Files:**
- Create: `/home/wula/IdeaProjects/sdd/CLAUDE.md`
- Create: `/home/wula/IdeaProjects/sdd/rules/architecture.md`
- Create: `/home/wula/IdeaProjects/sdd/rules/code-analysis.md`
- Create: `/home/wula/IdeaProjects/sdd/rules/testing.md`
- Create: `/home/wula/IdeaProjects/sdd/rules/api-contract.md`
- Create: `/home/wula/IdeaProjects/sdd/rules/workflow.md`
- Create: `/home/wula/IdeaProjects/sdd/rules/review.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/requirement-reviewer.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/design-reviewer.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/plan-critic.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/api-consistency-reviewer.md`
- Create: `/home/wula/IdeaProjects/sdd/agents/verification-reviewer.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/config.yaml`
- Create: `/home/wula/IdeaProjects/sdd/harness/explorations/2026-07-03-mvp-bootstrap-impact.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/goal.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/roadmap.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/spec.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/plan.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/result.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/changes/add-enterprise-harness-mvp/proposal.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/changes/add-enterprise-harness-mvp/specs/mvp-scope.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/specs/mvp-governance.md`
- Test: inspection via directory listing and file reads

**Interfaces:**
- Consumes: `/home/wula/IdeaProjects/sdd/harness/initiatives/enterprise-java-microservice-harness-blueprint/design.md`
- Produces: governance docs and artifact directories used by hooks and the reference service

- [ ] **Step 1: Write the governance files and harness artifact documents**
- [ ] **Step 2: Verify the expected `harness/`, `rules/`, and `agents/` files exist**
Run: `find /home/wula/IdeaProjects/sdd -maxdepth 4 \( -path '*/.git' -o -path '*/node_modules' \) -prune -o -print | sort`
Expected: lists the new governance directories and harness artifact files
- [ ] **Step 3: Record the MVP work slice intent in `result.md` as 'skeleton created, runtime wiring pending'**
- [ ] **Step 4: Skip commit because this workspace is not a git repository**
Expected: no commit attempted; the task notes the skip explicitly

### Task 2: Add project settings and validation hooks

**Files:**
- Create: `/home/wula/IdeaProjects/sdd/.claude/settings.json`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/settings.local.json`
- Create: `/home/wula/IdeaProjects/sdd/hooks/validate-spec-structure.sh`
- Create: `/home/wula/IdeaProjects/sdd/hooks/validate-openapi.sh`
- Create: `/home/wula/IdeaProjects/sdd/hooks/validate-controller-consistency.sh`
- Test: run each script directly from shell

**Interfaces:**
- Consumes: governance file layout from Task 1
- Produces: local hook commands and Claude Code project settings that point at them

- [ ] **Step 1: Write `.claude/settings.json` with PreToolUse / PostToolUse hook registration for the local scripts**
- [ ] **Step 2: Preserve the existing plugin enablement in `.claude/settings.local.json` while keeping project-level hook settings separate**
- [ ] **Step 3: Implement `validate-spec-structure.sh` to check required `harness/` directories and key files**
- [ ] **Step 4: Implement `validate-openapi.sh` to fail when `reference-service/openapi/order-service.yaml` is missing required top-level sections (`openapi`, `paths`, `components`)**
- [ ] **Step 5: Implement `validate-controller-consistency.sh` to compare endpoint markers in the YAML and the controller source**
- [ ] **Step 6: Run the scripts manually**
Run: `bash /home/wula/IdeaProjects/sdd/hooks/validate-spec-structure.sh && bash /home/wula/IdeaProjects/sdd/hooks/validate-openapi.sh && bash /home/wula/IdeaProjects/sdd/hooks/validate-controller-consistency.sh`
Expected: all three commands exit 0 after the reference service is created; before Task 4, only the structure script is expected to pass
- [ ] **Step 7: Skip commit because this workspace is not a git repository**

### Task 3: Build the minimal Java reference service skeleton with failing tests first

**Files:**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/pom.xml`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/ReferenceServiceApplication.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/CancelOrderUseCase.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/OrderCancellationService.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/OrderCancellationPolicy.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/OrderStatus.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/OrderRecord.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderRequest.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderResponse.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/resources/application.yml`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/application/OrderCancellationServiceTest.java`

**Interfaces:**
- Consumes: rules from `/home/wula/IdeaProjects/sdd/rules/*.md`
- Produces: controller signature `POST /api/orders/{orderId}/cancel`, application interface `CancelOrderUseCase#cancel(String orderId, String reason): CancelOrderResponse`, domain policy `canCancel(OrderStatus): boolean`

- [ ] **Step 1: Write the failing unit test for order cancellation business logic**
- [ ] **Step 2: Run the unit test and confirm it fails because the implementation is incomplete**
Run: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationServiceTest test`
Expected: FAIL with missing or incorrect cancellation implementation
- [ ] **Step 3: Add the minimal Spring Boot, application, domain, DTO, and controller code to make the unit test pass**
- [ ] **Step 4: Re-run the unit test**
Run: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationServiceTest test`
Expected: PASS
- [ ] **Step 5: Skip commit because this workspace is not a git repository**

### Task 4: Add persistence, OpenAPI ownership, and controller consistency

**Files:**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/OrderEntity.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/OrderJpaRepository.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/OrderRepository.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/JpaOrderRepository.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/openapi/order-service.yaml`
- Modify: `/home/wula/IdeaProjects/sdd/hooks/validate-openapi.sh`
- Modify: `/home/wula/IdeaProjects/sdd/hooks/validate-controller-consistency.sh`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`

**Interfaces:**
- Consumes: `CancelOrderUseCase#cancel(String, String)` from Task 3
- Produces: persisted order lookup and update path, OpenAPI contract for `POST /api/orders/{orderId}/cancel`

- [ ] **Step 1: Write the failing H2-backed integration test for the controller endpoint**
- [ ] **Step 2: Run the integration test and confirm it fails before persistence wiring is complete**
Run: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerIntegrationTest test`
Expected: FAIL with missing repository/persistence or contract mismatch
- [ ] **Step 3: Implement the JPA entity, repositories, adapter, and YAML contract**
- [ ] **Step 4: Re-run the integration test**
Run: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerIntegrationTest test`
Expected: PASS
- [ ] **Step 5: Run the hook scripts again**
Run: `bash /home/wula/IdeaProjects/sdd/hooks/validate-spec-structure.sh && bash /home/wula/IdeaProjects/sdd/hooks/validate-openapi.sh && bash /home/wula/IdeaProjects/sdd/hooks/validate-controller-consistency.sh`
Expected: PASS
- [ ] **Step 6: Skip commit because this workspace is not a git repository**

### Task 5: Verify the full local MVP and update result artifacts

**Files:**
- Modify: `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/result.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/mvp-governance.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/add-enterprise-harness-mvp/proposal.md`
- Test: full Maven test run and direct hook execution

**Interfaces:**
- Consumes: all prior governance files, scripts, and Java code
- Produces: verification evidence and inspectable final MVP notes

- [ ] **Step 1: Run the full reference-service test suite**
Run: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml test`
Expected: PASS with unit and integration tests green
- [ ] **Step 2: Run all hook scripts directly and record the output summary in `result.md`**
Run: `bash /home/wula/IdeaProjects/sdd/hooks/validate-spec-structure.sh && bash /home/wula/IdeaProjects/sdd/hooks/validate-openapi.sh && bash /home/wula/IdeaProjects/sdd/hooks/validate-controller-consistency.sh`
Expected: PASS
- [ ] **Step 3: Update `result.md` with what was built, what passed, and what is intentionally deferred from phase 1**
- [ ] **Step 4: Update the stable/spec/proposal docs so the MVP state is visible to a returning reviewer**
- [ ] **Step 5: Skip commit because this workspace is not a git repository**

## Self-Review

**1. Spec coverage:**
- Governance skeleton: covered by Task 1 and Task 2.
- `harness/` custom artifact model: covered by Task 1 and Task 5.
- Java reference service: covered by Task 3 and Task 4.
- OpenAPI / YAML validation and controller consistency: covered by Task 2 and Task 4.
- Mock unit tests + local DB integration tests: covered by Task 3, Task 4, and Task 5.
- Inspectable local MVP the user can review: covered by Task 1 through Task 5.

**2. Placeholder scan:**
- No `TODO`, `TBD`, or “similar to Task N” placeholders remain.
- Commit actions were replaced with explicit “skip commit” steps because the workspace is not a git repository.

**3. Type consistency:**
- Planned application interface is consistently `cancel(String orderId, String reason): CancelOrderResponse`.
- Planned endpoint is consistently `POST /api/orders/{orderId}/cancel`.
- Planned artifact roots are consistently under `harness/`.

## Execution Handoff

Plan complete and saved to `/home/wula/IdeaProjects/sdd/harness/work/enterprise-harness-mvp/slices/bootstrap-local-mvp/plan.md`.

Because the user explicitly asked me to go ahead and build the MVP while they are away, the next step is to execute it directly in this session.
