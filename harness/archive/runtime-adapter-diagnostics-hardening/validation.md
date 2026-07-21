# Validation

## Source Digest

- `harness/plugin/runtime/lib/local-adapter.mjs`
- `harness/plugin/runtime/local-adapter.example.json`
- `harness/plugin/runtime/setup-local-adapter.mjs`
- `harness/plugin/runtime/doctor.mjs`
- `harness/plugin/runtime/sync.mjs`
- `harness/plugin/runtime/install.mjs`
- `harness/plugin/runtime/README.md`
- `README.md`

## Artifact Digest

- active change: `harness/changes/runtime-adapter-diagnostics-hardening/`
- current state: `EXECUTING`
- current task: `Task 3: 对齐 runtime docs / validation`

## Commands Executed

Task 1 adapter validation command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs red`
Task 1 adapter validation result summary: RED first failed because the current validator still returned plain string errors, causing the smoke to crash on `nodeCommand 缺失` rather than structured problems; GREEN later passed after `local-adapter.mjs` was rewritten to emit structured `problem` objects and to normalize missing-file / malformed JSON / read-failure handling.
Task 2 diagnostics validation command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs red`
Task 2 diagnostics validation result summary: RED first failed because `setup/doctor/sync/install` still lacked a coherent field-level diagnostics surface; GREEN later passed after `doctor.mjs` / `sync.mjs` exposed structured `problems`, `setup-local-adapter.mjs` emitted manual-confirmation guidance, `setup --write` merge was verified by reading back the merged adapter file, and `install.mjs` was constrained to forward setup diagnostics inside the same temp-repo fixture.
Task 3 docs validation command: `python - <<'PY' ... exact doc assertions ... PY`
Task 3 docs validation result summary: RED first failed because README lacked `doctor --json`; GREEN later passed after README / runtime README / validation wording were aligned, and the script returned `OK exact doc assertions passed`.

1. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs red`
   - Result: RED observed; current validator still returned string errors, proving field-level diagnostics and read-failure handling were missing.
2. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs green`
   - Result: GREEN observed after restructuring `local-adapter.mjs`; smoke passed.
3. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs verify`
   - Result: verify smoke passed.
4. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs red`
   - Result: RED observed; current setup/doctor/sync/install surface did not yet provide the deterministic field-level diagnostics contract expected by the smoke.
5. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs green`
   - Result: GREEN observed after emitting structured local-adapter problems through `doctor --json` / `sync --json`, adding manual-confirmation guidance to setup/install paths, verifying `setup --write` merge by reading back the adapter file, and constraining `install` output to forwarded setup diagnostics.
6. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs verify`
   - Result: verify smoke passed with the same merge / install-forwarding assertions.
7. `python - <<'PY' ... exact doc assertions ... PY`
   - Result: RED observed; README initially lacked `doctor --json`.
8. `python - <<'PY' ... exact doc assertions ... PY`
   - Result: GREEN observed after README alignment; script returned `OK exact doc assertions passed`.

## Clarify / Requirements Confirmation

- issue #13 当前聚焦：local adapter schema + installer diagnostics
- 不在本轮扩到 release-local / source-external smoke 或 Java sample 变更

## Unit Tests

- Task 1 已完成 fixture-driven RED / GREEN / verify。
- Task 2 已完成 fixture-driven RED / GREEN / verify。
- Task 3 为 docs/validation 对齐 task，不新增业务代码测试。

## Unit Coverage

- 不适用。

## Architecture Tests

- 不适用；本轮是 runtime adapter contract 收紧。

## Integration Tests

- Task 2 的 temp repo / `HARNESS_LOCAL_ADAPTER` / bootstrap marker / command stubs smoke 已通过。

## Backend API E2E

- 不适用。

## OpenAPI Contract

- 不适用。

## Google Java Style

- 不适用。

## Review Verdicts

- requirement-reviewer: advisory
- design-reviewer: pass
- plan-critic: pass
- task-level `verification-reviewer`（Task 1）: pass
- task-level `verification-reviewer`（Task 2）: pass
- task-level `verification-reviewer`（Task 3）: pending

## Stage Gate Summary
- clarify: complete
- design: pass
- plan: pass
- tdd: Task 3 green reached, task review pending
- verify: change-level review pending

## Skipped Checks

- change-level reviewer / validated refresh：下一步执行

## Failures and Retries

- Task 1 的第一条 RED 不只是“失败”，还暴露了当前 validator 仍返回 string error array；这正好证明了结构化 diagnostics contract 尚未落地。
- Task 2 的初始 diagnostics smoke 因执行顺序问题未能读取到缺字段 adapter；已把 smoke 顺序调整为先读 doctor/sync，再执行 `--write` merge，确保 RED/GREEN 都围绕真实诊断面而不是偶然副作用。
- Task 3 的第一次 GREEN 失败，因为 README 未精确包含 `doctor --json`；补齐后转绿。

## Final Verdict

- 当前 change 已完成 #13 的 Task 1 / Task 2 / Task 3 RED → GREEN → verify 证据建立。
- 下一步只剩 task-level `Task 3` reviewer 收口与 change-level validation / close。
