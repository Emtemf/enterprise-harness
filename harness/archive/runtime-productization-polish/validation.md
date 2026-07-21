# Validation

## Source Digest

- `harness/plugin/runtime/*.mjs`
- `harness/specs/plugin-runtime.md`
- `harness/specs/release-readiness.md`
- `harness/specs/runtime-contract.md`
- `README.md`

## Artifact Digest

- active change: `harness/changes/runtime-productization-polish/`
- current state: validated and close-ready

## Commands Executed

- `codegraph_explore("harness plugin runtime cli.mjs install.mjs update.mjs upgrade.mjs migrate.mjs release-local.mjs verify.mjs upstream-check.mjs context7.mjs help usage argv process.cwd external cwd")`
- `find /home/wula/IdeaProjects/sdd/harness/changes/runtime-productization-polish -maxdepth 2 -type f | sort`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs red`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs green`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs verify`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs red`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs green`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs verify`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs red`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs green`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs verify`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs doctor --json`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs sync --json`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs upstream-check --json`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/lifecycle.mjs validated runtime-productization-polish`

## Clarify / Requirements Confirmation

- issue #10 当前聚焦：launcher/help/readiness/upstream-check 契约
- 本轮明确不新建 `verify-contract` / `verify-readiness` 命令
- 本轮明确不扩展 global install wrapper，不触碰 #13 的 adapter diagnostics 语义
- 已移除“把 #15 当作 machine-readable 已完成依赖”的前提表述，改成“复用当前仓库已有的 fresh source-external release smoke 证据”

## Review Verdicts

- `requirement-reviewer`: pass（machine-readable #15 completion 前提已移除，scope/L3 合理）
- `design-reviewer`: advisory（真实 design blocker 已消除，仅剩少量旧文案残留）
- `plan-critic`: advisory（真实 plan blocker 已消除，仅剩少量旧叙述/状态残留）
- task-level `verification-reviewer`（Task 1）: pass
- task-level `verification-reviewer`（Task 2）: pass
- task-level `verification-reviewer`（Task 3）: pass
- change-level `verification-reviewer`: pass

## Stage Gate Summary
- clarify: ready
- design: cleared
- plan: cleared
- tdd: Task 1 (`task1-help-contract`), Task 2 (`task2-launcher-contract`), Task 3 (`task3-readiness-contract`) red/green/verify complete; task reviews pass
- verify: complete
- archive: close-ready

## Failures and Retries

- 首轮 design / requirement / plan reviewers 均返回 block，原因分别集中在：
  - verify/readiness 与 upstream-check mismatch 产品决策未冻结
  - #15 完成前提写得过头，超出 machine-readable truth
  - tasks 缺少 deterministic fixture / assertion matrix
- 后续收口已进一步明确：
  - `.bootstrap-ran` 判据改成前后状态不变，而不是假设仓库初始不存在
  - 长期稳定 spec 唯一 SoT 为 `harness/specs/runtime-contract.md`
  - `harness/changes/runtime-productization-polish/specs/runtime-contract.md` 只保留过程留痕
- Task 1 fresh evidence:
  - RED：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs red`
    - 退出 1，明确暴露 `install --help` / `install -h` 触发 bootstrap/setup side effect
  - GREEN：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs green`
    - 通过
  - VERIFY：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-help-contract-smoke.mjs verify`
    - 通过
  - 扩展 smoke 覆盖 `update/migrate` 的 existing/missing fixture 双场景，以及 `cli.mjs --help/-h` 后，再次运行 GREEN / VERIFY，均通过
- 已写入 task-level review：`harness/changes/runtime-productization-polish/reviews/verification-reviewer-task1.json`（verdict=pass）
- Task 2 fresh evidence:
  - RED：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs red`
    - 退出 1，明确暴露 external-cwd `cli.mjs status` 的 `MODULE_NOT_FOUND`
  - GREEN：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs green`
    - 通过
  - VERIFY：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-launcher-contract-smoke.mjs verify`
    - 通过
- 已写入 task-level review：`harness/changes/runtime-productization-polish/reviews/verification-reviewer-task2.json`（verdict=pass）
- Task 3 fresh evidence:
  - RED：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs red`
    - 退出 1，明确暴露 verify JSON/human contract 缺失、upstream-check mismatch 不 fail、以及 docs exact strings 缺失
  - GREEN：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs green`
    - 通过
  - VERIFY：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-readiness-contract-smoke.mjs verify`
    - 通过
- 已写入 task-level review：`harness/changes/runtime-productization-polish/reviews/verification-reviewer-task3.json`（verdict=pass）
- change-level verification fresh evidence:
  - `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
    - 通过；human output 明确为 contract-only success + separate readiness guidance
  - `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
    - 通过；`ok=true` 且 `runtimeReadinessChecks.status=not-run`
  - `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs doctor --json`
    - 通过；`ok=true`，仅保留 Context7 runtime warn
  - `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs sync --json`
    - 通过；`ok=true`，仅保留 `context7-env` warn
  - `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs upstream-check --json`
    - 通过；runtime-upstream 为 `validated-version-match`，reference-upstream 为 `manual-review`
- 已写入 change-level review：`harness/changes/runtime-productization-polish/reviews/verification-reviewer.json`（verdict=pass）

## Final Verdict

- 当前 change 已完成 requirement/design/plan/TDD/verify 收口，并已刷新 machine-readable validation 为 fresh，可进入 close / archive。
