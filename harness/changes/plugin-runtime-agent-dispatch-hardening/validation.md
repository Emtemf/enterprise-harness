# Validation

## Role Ownership

- 主导：当前实现会话
- 机械复核：handoff/agent/hook/ambiguity/plugin contract smoke
- 独立语义 checker：尚未为新增 Task 5 生成正式 reviewer artifact
- 状态：实现验证通过；workflow 保持 `EXECUTING`，不伪装成已归档

## Artifact Digest

- 当前提交前工作树已通过全量 deterministic smoke 与 prepublish。
- 最终 commit digest 在提交后由 Git 提供；本文件不预填未来 commit。

## Commands Executed

- `node harness/plugin/runtime/test/handoff-contract-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/handoff-cli-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/isolated-stage-contract-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/behavior-hook-registry-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/agent-lifecycle-hook-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/ambiguity-scoring-contract-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/ambiguity-gate-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/plugin-native-hooks-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs verify` → PASS
- 全量 `harness/plugin/runtime/test/*.mjs verify` → `TOTAL_FAILURES=0`
- `node harness/plugin/runtime/cli.mjs verify` → PASS
- `claude plugin validate .` → PASS，零 warning
- `npm run prepublish-check` → PASS
- `(cd reference-service && mvn test)` → BUILD SUCCESS；14 tests，0 failures/errors/skips

## Clarify / Requirements Confirmation

- 七维均为 5，Overall 5.0，评分依据完整。
- 用户明确确认隔离 executor/checker、预加载 Skill、hook 接力、TECPC 与可诊断性目标。
- Claude 账户、认证、订阅、配额和服务容量明确排除在插件验收范围之外。

## Unit Tests

- Handoff 输入/结果 schema、parentRunId、executor/checker Skill 映射通过。
- 缺 `HANDOFF_INPUT`、malformed result、缺独立 checker 均有失败反例。
- ambiguity score 的整数范围、依据、Overall 和 weakest 计算通过。

## Architecture Tests

- 每个 registry behavior 的 executor 与 checker 不同。
- 所有 executor/checker agent frontmatter 预加载正确 Skill。
- 主 orchestrator Skill 明确 subagent 不再派生 subagent，由 main 串行接力。
- TDD executor 继续使用 `isolation: worktree`；普通只读检查不混淆上下文隔离和文件隔离。

## Integration Tests

- Agent `PreToolUse → SubagentStart → SubagentStop → PostToolUse → TaskCompleted` fixture 通过。
- executor 完成但 checker 缺失时 `EH-CHECKER-REQUIRED-005` 阻断；checker pass 后放行。
- plugin/local hook manifests 同步覆盖 Agent failure 与 TaskCompleted。
- package/install/launcher/prepublish smokes 全部通过。

## Backend API E2E

- `reference-service` 真实 Spring Boot HTTP、OpenAPI semantic、integration、repository 与 architecture tests 随 `mvn test` 通过。

## OpenAPI Contract

- 本轮未修改 OpenAPI；现有 semantic test 通过。

## Google Java Style

- 本轮未修改 Java。

## Review Verdicts

- `requirement-reviewer`：历史 requirements verdict PASS。
- `design-reviewer`：历史 design verdict PASS。
- `design-reviewer-worktree-amendment`：历史 worktree amendment verdict PASS。
- `plan-critic`：历史 plan verdict PASS。
- `code-reviewer-task1`：PASS。
- `code-reviewer-task2`：PASS，但 `receiptDigest=null`，未绑定执行 receipt。
- `code-reviewer-task3`：PASS，但 `receiptDigest=null`，未绑定执行 receipt。
- `code-reviewer-task4`：PASS，但 `receiptDigest=null`，未绑定执行 receipt。
- Task 5 的机械合同全部 PASS。
- 正式独立 checker artifact 尚未生成，因此不把 state 推进为 `REVIEWED/VALIDATED`。

## Stage Gate Summary

- clarify：PASS
- route：PASS
- design：实现与文档一致性 smoke PASS；正式新 digest review 待补
- plan：Task 5 已记录并可执行
- tdd：**证据不完整**。仅 task-1 有可导入的全链路 receipt；task-2/3/4 的 TDD 证据链
  永久缺失，详见 `change.md` Waiver W-1。runtime contract tests 与 Maven regression PASS，
  但这些不构成 TDD receipt。`workflow.tddStatus` 如实保持 `not-started`。
- verify：deterministic validation PASS
- archive：未执行

## TDD Evidence Gap（2026-07-30 收敛）

| task | 执行 receipt | 处置 |
|------|-------------|------|
| task-1 | 完整，已导入 `evidence/tdd/task-1.json` | 无需动作 |
| task-2 | spool 有真实 RED/GREEN/REFACTOR，但无权威 `task-2.json`，且早于最终 commit | 不导入，记 W-1 |
| task-3 | 无 | 不补录，记 W-1 |
| task-4 | 无 | 不补录，记 W-1 |

替代验证（2026-07-30 执行，仅证明当前代码正确，不具 receipt 效力）：

- `task2-plugin-agent-smoke.mjs verify` → PASS
- `task3-gate-completion-smoke.mjs verify` → PASS
- `task4-release-acceptance-smoke.mjs verify` → PASS

## Skipped Checks

- 需要 Claude 账户的 live invocation：N/A，不属于插件 release/completion gate。
- GitHub tag/release/npm publish：未授权，也不属于本次提交要求。

## Failures and Retries

- 第一轮全量 smoke 发现两个旧文案断言仍校验“阶段 Skill 直接产出”；已更新为
  `brief → handoff → executor → checker` 合同并复跑通过。
- 未通过修改 gate 或降低断言规避失败。
- 上述失败已修复并重试完成，当前不存在未解决 blocker。

## Final Verdict

PASS（实现验证）：隔离 executor/checker、TECPC handoff、hook 生命周期、澄清评分、诊断错误码、
文档一致性、plugin validate、prepublish 与 Maven regression 均通过。

SKIP/豁免说明：账户型 live invocation 不属于插件验收；GitHub Release/npm publish 未获授权。

WORKFLOW PENDING：在没有正式 Task 5 独立 checker artifact 时，保持 active change 为
`EXECUTING`，不冒充 `VALIDATED` 或归档。
