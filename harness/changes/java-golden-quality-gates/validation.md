# Validation

## Source Digest

- `reference-service/pom.xml`
- `reference-service/src/test/java/com/example/orders/domain/OrderCancellationPolicyArchitectureTest.java`
- `reference-service/src/test/java/com/example/orders/**`
- `README.md`
- `CONTRIBUTING.md`

## Artifact Digest

- active change: `harness/changes/java-golden-quality-gates/`
- current state: `EXECUTING`
- current task: `Task 3: 明确 reference-service quality profile 的本地验证与后续 CI 接入位置`

## Commands Executed

Task 1 ArchUnit validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test
Task 1 ArchUnit validation result summary: RED first failed at `testCompile` because `com.tngtech.archunit.*` packages and symbols were missing; GREEN later reached `Tests run: 3, Failures: 0, Errors: 0, Skipped: 0` after adding `archunit-junit5` and converting the test to explicit JUnit 5 `@Test` + `ArchRule.check(...)`.
Task 2 JaCoCo validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify
Task 2 JaCoCo validation result summary: RED first failed at `jacoco:check` with `lines covered ratio is 0.94, but expected minimum is 1.00`; GREEN later passed with final `BUNDLE + LINE + 85%`.

1. `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
   - Result: baseline passed before ArchUnit / JaCoCo wiring; this only confirmed current tests pass, not that #12 gates already exist.
2. `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test`
   - Result: RED observed after converting the test to ArchUnit syntax before adding the dependency; Maven failed in `testCompile` with missing `com.tngtech.archunit.*` packages and unresolved symbols such as `AnalyzeClasses`, `ArchTest`, and `ArchRule`.
3. `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test`
   - Result: GREEN observed after adding `archunit-junit5` and converting the architecture check to executable JUnit 5 tests; `Tests run: 3, Failures: 0, Errors: 0, Skipped: 0`.
4. `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml test`
   - Result: broader verification passed after Task 1 green; `Tests run: 11, Failures: 0, Errors: 0, Skipped: 0`.
5. `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
   - Result: RED observed after wiring JaCoCo with a temporary 100% line threshold; `jacoco:check` failed with `lines covered ratio is 0.94, but expected minimum is 1.00`.
6. `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
   - Result: GREEN observed after lowering the frozen rule to final `BUNDLE + LINE + 85%`; JaCoCo `report` and `check` both passed.
7. `python - <<'PY' ... exact doc assertions ... PY`
   - Result: RED observed before doc updates; README / CONTRIBUTING / validation.md all missed at least one required exact assertion.
8. `python - <<'PY' ... exact doc assertions ... PY`
   - Result: GREEN observed after doc updates; script returned `OK exact doc assertions passed`.
9. `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
   - Result: verification passed after Task 3 doc updates; ArchUnit + JaCoCo gate remained green.

## Clarify / Requirements Confirmation

- issue #12 scope 已收窄为：ArchUnit + JaCoCo + 本地验证说明
- 不在本轮宣称真实 HTTP E2E / OpenAPI parser gate 已完成

## Unit Tests

- Task 1 已完成 RED / GREEN：ArchUnit 目标测试先因缺依赖编译失败，再在接入 `archunit-junit5` 后转绿。
- Task 2 已完成 RED / GREEN：JaCoCo 先以 100% line threshold 确认 `jacoco:check` 真正生效，再收敛到最终 85% rule 并转绿。
- Task 3 为文档/validation 对齐 task，本身不新增 Java 业务测试，但依赖 Task 1 / Task 2 的真实结果。

## Unit Coverage

- JaCoCo gate 已接入 Maven `verify`。
- 当前 RED 证据：`lines covered ratio is 0.94, but expected minimum is 1.00`
- 当前 GREEN 证据：在最终 `85%` line rule 下 `All coverage checks have been met.`

## Architecture Tests

- Task 1 当前已引入 ArchUnit JUnit 5 架构测试，并验证通过：
  - domain / domain.repository 不依赖 framework 或外层实现
  - application 不依赖 interfaces / infrastructure
  - interfaces 不直接依赖 domain / infrastructure（导入范围已排除 test classes）

## Integration Tests

- `mvn test` 与 `mvn verify` 当前都通过，其中继续包含现有 controller / repository integration 路径。

## Backend API E2E

- 不在本 issue 当前最小范围内。

## OpenAPI Contract

- 不在本 issue 当前最小范围内。

## Google Java Style

- 当前修改集中在 `pom.xml`、一个 Java 测试类与文档/validation 资产，仍保持现有仓库风格。

## Review Verdicts

- requirement-reviewer: advisory
- design-reviewer: pass
- plan-critic: pass
- task-level `verification-reviewer`（Task 1）: pass
- task-level `verification-reviewer`（Task 2）: pass
- task-level `verification-reviewer`（Task 3）: pass

## Stage Gate Summary
- clarify: complete
- design: pass
- plan: pass
- tdd: Task 1 / Task 2 / Task 3 已完成并有对应 task-level review
- verify: change-level verification-reviewer 已 pass，可进入 validated refresh

## Skipped Checks

- 真实 HTTP E2E / OpenAPI parser：不在本 issue 当前最小范围内

## Failures and Retries

- 初次把 ArchUnit 写成 `@AnalyzeClasses` + `@ArchTest` static-field 形式后，targeted test 出现 `Tests run: 0`，虽然构建成功，但不足以作为有效门禁证据；已改成显式 JUnit 5 `@Test` + `ArchRule.check(...)` 路径并重新验证。
- 首次规则把 test classes 一并纳入 import，导致 `OrderCancellationControllerIntegrationTest` 对 `OrderJpaRepository` / `OrderEntity` 的测试依赖触发误报；已通过 `ImportOption.Predefined.DO_NOT_INCLUDE_TESTS` 收窄到 production classes。
- 首次 JaCoCo rule 故意临时设为 `100%`，用于产生确定性 RED；在观察到 `0.94 < 1.00` 失败后，已收敛回设计冻结的最终 85% 规则。
- Task 3 初次精确断言 GREEN 失败，因为 README 中本地 quality gate 命令仍在反引号内，未与 task 规定的精确文本完全匹配；调整后重跑通过。

## Final Verdict

- 当前 change 已完成 #12 的 Task 1 / Task 2 / Task 3，并已获得对应 task-level verification review pass。
- 当前 change 也已具备 change-level verification-reviewer pass；issue #12 的范围目标已经完成。
- 后续若继续推进真实 HTTP E2E / OpenAPI parser，应归入更宽的 #9，而不是重新回到 #12。
