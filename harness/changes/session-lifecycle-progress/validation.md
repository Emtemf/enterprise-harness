# Validation

## Source Digest

- Change: `session-lifecycle-progress`
- Current task slice: `task-1-status-progress-surface` + `task-2-session-start-summary` + `task-3-contract-surface-wiring` + `task-4-stop-handoff-guidance`
- Scope: `PROGRESS.md`、`harness/specs/session-lifecycle.md`、`status` top-level CLI 命令、`status-summary` 契约、SessionStart 摘要、contract wiring、Stop handoff guidance、Task 1 / Task 2 / Task 3 / Task 4 smoke harness

## Artifact Digest

- `PROGRESS.md`
- `harness/specs/session-lifecycle.md`
- `harness/plugin/runtime/status.mjs`
- `harness/plugin/runtime/lib/status-summary.mjs`
- `harness/plugin/runtime/cli.mjs`
- `package.json`
- `harness/plugin/manifest.json`
- `harness/plugin/runtime/test/session-status-smoke.mjs`
- `harness/plugin/runtime/hooks/session-start.mjs`
- `harness/plugin/runtime/test/session-start-summary-smoke.mjs`
- `harness/plugin/runtime/hooks/stop.mjs`
- `harness/plugin/runtime/test/stop-handoff-smoke.mjs`
- `harness/plugin/runtime/test/fixtures/stop-handoff-missing-validation/state.json`
- `harness/plugin/runtime/test/fixtures/stop-handoff-stale-validation/state.json`

## Commands Executed

1. RED
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs red`
   - Result: failed as expected
   - Key Output: `Expected status command, status --json contract, or package/manifest wiring to be missing before implementation`
2. GREEN
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs green`
   - Result: passed
   - Key Output: `Green status smoke passed.`
3. Verify smoke
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs verify`
   - Result: passed
   - Key Output: `Status verify smoke passed.`
4. Runtime verify
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify`
   - Result: passed
   - Key Output: `OK contract and runtime checks passed.`
5. SessionStart GREEN
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs green`
   - Result: passed
   - Key Output: `Green session-start smoke passed.`
6. Task 2 RED
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs red`
   - Result: failed as expected
   - Key Output: `Expected SessionStart summary to omit progress source, active change summary, or status command hint before implementation`
7. Task 2 GREEN
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs green`
   - Result: passed
   - Key Output: `Green session-start smoke passed.`
8. Task 2 verify smoke
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs verify`
   - Result: passed
   - Key Output: `Session-start verify smoke passed.`
9. Doctor after SessionStart changes
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs doctor`
   - Result: passed
   - Key Output: `OK state: active-change` 与 `session-lifecycle-progress`
10. Task 3 RED
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs red`
   - Result: failed as expected
   - Key Output: `Expected doctor, verify, full-verify, or repo-facing doc entrypoints to miss PROGRESS.md or session-lifecycle.md before implementation`
11. Task 3 GREEN
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs green`
   - Result: passed
   - Key Output: `Green contract-surface smoke passed.`
12. Task 3 verify smoke
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs verify`
   - Result: passed
   - Key Output: `Contract-surface verify smoke passed.`
13. Doctor after Task 3 changes
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs doctor`
   - Result: passed
   - Key Output: `OK required-file: PROGRESS.md` 与 `OK required-file: harness/specs/session-lifecycle.md`
14. Runtime verify after Task 3 changes
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify`
   - Result: passed
   - Key Output: `OK contract and runtime checks passed.`
15. Full verify after Task 3 changes
   - Command: `cd /home/wula/IdeaProjects/sdd && bash hooks/full-verify.sh`
   - Result: passed
   - Key Output: `Full verify（骨架阶段）通过。`
16. Task 4 RED
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs red`
   - Result: failed as expected
   - Key Output: `Expected Stop guidance or validation block contract to be incomplete before implementation`
17. Task 4 GREEN
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs green`
   - Result: passed
   - Key Output: `Green stop handoff smoke passed.`
18. Task 4 verify smoke
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs verify`
   - Result: passed
   - Key Output: `Stop handoff verify smoke passed.`
19. Stop hook output after Task 4 changes
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/hooks/stop.mjs`
   - Result: passed
   - Key Output: `Stop handoff guidance:` 与 `node harness/plugin/runtime/cli.mjs status`
20. Doctor after Task 4 changes
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs doctor`
   - Result: passed
   - Key Output: `OK required-file: PROGRESS.md` 与 `OK required-file: harness/specs/session-lifecycle.md`
21. Runtime verify after Task 4 changes
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify`
   - Result: passed
   - Key Output: `OK contract and runtime checks passed.`
22. Full verify after Task 4 changes
   - Command: `cd /home/wula/IdeaProjects/sdd && bash hooks/full-verify.sh`
   - Result: passed
   - Key Output: `Full verify（骨架阶段）通过。`
23. Runtime verify after final validation state
   - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify`
   - Result: passed
   - Key Output: `OK contract and runtime checks passed.`
24. Full verify after final validation state
   - Command: `cd /home/wula/IdeaProjects/sdd && bash hooks/full-verify.sh`
   - Result: passed
   - Key Output: `Full verify（骨架阶段）通过。`

## Unit Tests

- 不适用。本任务使用 runtime smoke 脚本作为主要 RED/GREEN/verify 证据。

## Unit Coverage

- 不适用。

## Architecture Tests

- `session-status-smoke.mjs` 已覆盖：
  - `status` top-level CLI 命令存在
  - `status --json` 稳定顶层字段存在
  - 人类可读输出固定标题存在
  - `package.json` status script 可运行
  - `harness/plugin/manifest.json` status command 可运行

## Integration Tests

- `node harness/plugin/runtime/cli.mjs verify`

## Backend API E2E

- 不适用。

## OpenAPI Contract

- 不适用。

## Google Java Style

- 不适用。

## Review Verdicts

- `requirement-reviewer`: pass
- `design-reviewer`: pass
- `plan-critic`: pass（正式 plan）
- `task1-plan-critic`: pass
- `task2-plan-critic`: pass
- `task3-plan-critic`: pass
- `task4-plan-critic`: pass
- `verification-reviewer`: pass

## Skipped Checks

- `context7-cli-runtime` 在 doctor 中仍为 WARN（`fetch failed`），但当前 change 未引入新的外部库/版本行为，本次不作为 block。
- JaCoCo / ArchUnit / 真实 HTTP API E2E 尚未接入到本仓库，不在本次 change 的 MVP 验证范围内。

## Failures and Retries

- Task 1 首轮 task review 返回 block，指出：
  - smoke 的 red 分支未真实覆盖 `status --json` 契约缺失
  - package/manifest wiring 未被 smoke 真正 exercised
  - validation.md 未记录 Task 1 的 RED/GREEN/verify 证据
- 已处理：
  - 扩展 `session-status-smoke.mjs`，让 `red` / `green` / `verify` 同时覆盖 `status --json` 契约、人类可读标题、package script、manifest command
  - 补录本验证文档
- Task 3 首轮 green/verify smoke 曾因 `harness/specs/directory-model.md` 使用 `session lifecycle` 空格写法而失败；已统一为 `session-lifecycle` 后恢复 GREEN。

## Final Verdict

- Task 1 / Task 2 / Task 3 / Task 4：均已完成 RED → GREEN → verify，并补齐对应 smoke/runtime 证据。
- 当前 change 已具备 `status`、SessionStart、Stop、doctor、runtime verify、full-verify 与 repo-facing 文档入口的一致性闭环。
- `state.json` 已同步到 `VALIDATED` + `validation.status=fresh`，当前 source-of-truth 与验证证据已对齐。
- verification review 已通过；当前 change 可作为 `VALIDATED` 的 session lifecycle / progress surface 基线继续使用。
