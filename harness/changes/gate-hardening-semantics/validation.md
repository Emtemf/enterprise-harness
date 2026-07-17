# Validation

## Source Digest

- Validation scope: issue #8 / `gate-hardening-semantics` **Task 1 + Task 2 + Task 3 + Task 4 + Task 5**（design gate / plan-task gate / reviewer-validation completion contract / task-scoped RED gate / validation digest hardening）
- 当前 change 总状态：`state=REVIEWED`
- 当前 change 总体验证状态：`validation.status=fresh`
- 本文件本轮记录 Task 1 / Task 2 / Task 3 / Task 4 / Task 5 的 RED / GREEN / verify 证据，不宣称整个 issue #8 已全部关闭

## Artifact Digest

- rules: `.claude/rules/00-workflow.md`
- specs: `harness/specs/artifact-lifecycle.md`
- template: `harness/templates/state.json`
- runtime: `harness/plugin/runtime/lib/checks.mjs`
- runtime: `harness/plugin/runtime/hooks/stop.mjs`
- template: `harness/templates/review-verdict.json`
- smoke: `harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs`
- smoke: `harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs`
- smoke: `harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs`
- smoke: `harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs`
- smoke: `harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`
- fixture: `harness/plugin/runtime/test/fixtures/design-gate-missing-review/state.json`
- fixture: `harness/plugin/runtime/test/fixtures/task-gate-draft-tasks/tasks.md`
- fixture: `harness/plugin/runtime/test/fixtures/review-validation-stale/state.json`
- fixture: `harness/plugin/runtime/test/fixtures/red-task-missing-proof/state.json`
- normalization: `harness/changes/gate-tightening-skeleton/state.json`

## Commands Executed

1. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs red`
   - Result: failed as expected with `Expected DESIGN_APPROVED transition to be blocked when design reviewer verdict is missing or block`
2. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green`
   - Result: passed
3. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
   - First result: failed before repo normalization, exposing `/home/wula/IdeaProjects/sdd/harness/changes/gate-tightening-skeleton/state.json: designApproved requires design.md` and `reviews/design-reviewer.json`
   - Follow-up action: removed stale demo gates from `gate-tightening-skeleton/state.json` so the repo no longer contains an orphaned `designApproved=true` sample
4. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
   - Result: both passed; repo-level verify returned `ok: true`
5. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs red`
   - Result: failed as expected with `Expected TASKED transition to reject draft tasks or missing currentTask semantics`
6. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green`
   - Result: passed
7. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
   - Result: both passed; repo-level verify returned `ok: true`
8. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs red`
   - Result: failed as expected with `Expected blocking review verdict or stale validation to fail verification/stop contract`
9. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green`
   - Result: passed
10. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/stop.mjs`
   - Result: smoke passed，repo-level verify returned `ok: true`，并已显式覆盖 `verify` 对 `REVIEWED + validation.status=stale` 的阻断，以及 Stop 对 stale validation / 缺 reviewer completion contract 的阻断
11. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs red`
   - Result: failed as expected with `Expected production/openapi writes to require currentTask-scoped red verification`
12. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green`
   - Result: passed
13. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
   - Result: both passed; repo-level verify returned `ok: true`
14. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs red`
   - Result: failed as expected with `Expected validated lifecycle to reject caller-supplied or stale validation digest semantics`
15. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green`
   - Result: passed
16. `node --input-type=module - <<'NODE' ... computeValidationDigest ... NODE && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
   - Result: backfilled computed digests for all existing `validation.status=fresh` changes; repo-level verify returned `ok: true`
17. `node --input-type=module - <<'NODE' ... set gate-hardening-semantics to REVIEWED + fresh digest ... NODE && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
   - Result: final change-level refresh completed; repo-level verify returned `ok: true`

## Unit Tests

- 本轮无 Java 单元测试。
- 当前验证对象是 governance/runtime contract，不是 `reference-service` 业务逻辑。

## Unit Coverage

- 未运行覆盖率统计。
- 原因：本轮不涉及 Java 业务代码或 coverage profile。

## Architecture Tests

- 通过了 design gate contract 的定向 smoke：
  - 缺 `design-reviewer` verdict
  - `design-reviewer` verdict=`block`
  - 缺 `gates.designApproved=true`
- 通过了 plan/task gate contract 的定向 smoke：
  - draft `tasks.md` 不得推进到 `TASKED`
  - `EXECUTING` 必须绑定非空 `currentTask`
- 通过了 reviewer/validation completion contract 的定向 smoke：
  - `impact.api=yes` 且缺 `api-consistency-reviewer` verdict 时，完成态必须被阻断
  - `REVIEWED` + `validation.status=stale` 时，`verify` 必须阻断
  - `VALIDATED` + `validation.status=stale` 时，Stop hook 必须阻断结束
- 通过了 task-scoped RED gate 的定向 smoke：
  - 仅有全局 `redVerified=true` 但缺少 `gates.redTask === currentTask` / `redEvidenceRef` 时，生产源码写路径必须阻断
  - 当 `redTask` 与 `currentTask` 对齐且 `redEvidenceRef` 存在时，pre-write 才允许放行
- 通过了 validation digest hardening 的定向 smoke：
  - `validated` lifecycle 不再接受调用方提供的 digest 作为最终真相，而是由 runtime/verifier 计算
  - 变更 change artifact 后，fresh digest mismatch 必须使 `verify` 失败
  - active change 资产写入后，Post-write 必须把 `validation.status` 标成 `stale`

## Integration Tests

- 本轮未新增传统集成测试。
- 替代性证据为 runtime `verify --json` + task-specific smoke。

## Backend API E2E

- 未执行。
- 原因：本 task 不涉及后端 HTTP 行为。

## OpenAPI Contract

- 未执行新的 OpenAPI 语义验证。
- 原因：`impact.api = no`。

## Google Java Style

- 未执行。
- 原因：本 task 不涉及 Java 源码变更。

## Review Verdicts

- task-level `plan-critic`（Task 1）：pass
- task-level `plan-critic`（Task 2）：pass
- task-level `verification-reviewer`（Task 3）：pass
- task-level `verification-reviewer`（Task 4）：pass
- task-level `verification-reviewer`（Task 5）：pass
- change-level `verification-reviewer`：pass

## Skipped Checks

- Java golden sample / ArchUnit / JaCoCo / HTTP E2E：不在本 change 当前任务范围内
- mutation-path 全覆盖（不仅限当前 hook 可见路径）与更强 transition matrix：仍属于 issue #8 的后续深化范围

## Failures and Retries

- 首次 repo `verify --json` 暴露了旧 demo change `gate-tightening-skeleton` 中的孤儿 `designApproved=true` 样本；该样本会与新的 design gate 语义冲突。
- 已通过移除该 demo state 中的伪 gate 值完成一次收口，再次验证后通过。

## Final Verdict

- issue #8 / `gate-hardening-semantics` Task 1 / Task 2 / Task 3 / Task 4 / Task 5 已在各自 task-level 范围内形成独立 smoke + verify 证据链。
- design gate 现已被更明确地固定为：进入 plan / `TASKED` 前，必须具备 design artifact、非 block 的 `design-reviewer` verdict，以及可消费的 `gates.designApproved=true`。
- plan/task gate 现已被更明确地固定为：`tasks.md` 仍为 draft 或缺少可消费 `plan-critic` verdict 时，不得进入 `TASKED`；`EXECUTING` 必须绑定非空 `currentTask`。
- reviewer/validation completion contract 现已被更明确地固定为：required blocking reviewer 缺失、`reviewedAt` 为空、`changeId` 不匹配，或完成态 validation stale 时，`verify` 与 `stop` 都必须阻断。
- `RED_VERIFIED` 现已被收紧为 currentTask 级消费：仅有全局 `redVerified=true` 不再足够，必须同时满足 `gates.redTask === currentTask` 且存在 `redEvidenceRef`。
- validation digest 现已被收紧为 runtime/verifier 计算；fresh digest mismatch 会使 `verify` 失败，active change 资产写入会自动把 validation 标成 `stale`。
- 当前 change 已完成 final refresh 到 `REVIEWED + fresh validation`，接下来只需 change-level `verification-reviewer` verdict 与最终 `VALIDATED` 刷新，即可支撑 issue #8 关闭。
