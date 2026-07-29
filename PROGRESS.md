# Enterprise Harness 当前进度

更新时间：2026-07-29

## 动态真相

- active change：`plugin-runtime-agent-dispatch-hardening`
- tier：L3
- 当前目标：修复 Claude Code plugin canonical entry、scoped subagent 驱动、agent-aware hooks、权威 TDD evidence、completion/archive 与 release acceptance
- workflow：`clarify → route → design → plan → tdd → verify → archive`
- requirements/design/plan：已澄清、独立评审并批准
- Task 1：authoritative agent/TDD evidence foundation 已实现并评审
- Task 2：canonical entry、scoped dispatch、portable launcher 与 parent-HEAD worktree hardening 已集成，独立 review PASS
- Task 3：agent-aware cumulative gates 与统一 completion predicate 已实现，独立 review PASS
- Task 4：版本/发布验收、CI P0 与 clean-target live E2E harness 已实现，反假绿修复后独立 review PASS
- validation：尚未刷新；完成 Task 2–4 review/evidence 后统一执行

动态状态以 `harness/ACTIVE_CHANGE` 与 `harness/changes/plugin-runtime-agent-dispatch-hardening/state.json` 为准，本文件只提供人类可读快照。

## 当前入口

| 运行面 | 主入口 | 阶段入口 | Backend |
|---|---|---|---|
| plugin install | `/enterprise-harness:harness` | `/enterprise-harness:harness-*` | `enterprise-harness <command>` |
| standalone checkout | `/harness` | `/harness-*` | `node harness/plugin/runtime/cli.mjs <command>` |

plugin Agent subtype 必须使用 `enterprise-harness:<agent>`；standalone 的 logical name 只用于本地发现和兼容，不得写入 plugin-facing dispatch。

## 已落地的 P0 合同

- 需求必须先 clarify，七维歧义评分完整且用户明确确认 scope 后才能 route
- 代码探索只允许 active scoped `code-explore`；同 agent 先留下 CodeGraph attempt 才能 fallback
- 外部库/框架/SDK 事实采用 Context7-first，不足时再查官方资料
- 受治理写入覆盖 Write/Edit/NotebookEdit 与常见 Bash 写面，并累计校验 clarify、route、design、plan、review、agent identity、CodeGraph 与 current-task RED receipt
- TDD 由隔离 worktree 中的 scoped executor 执行；`tdd-run` 真实记录 exact argv、exit、时间、agent、worktree、HEAD/tree digest，集成后由 `evidence-import` 生成 durable evidence
- verify、Stop、archive 共享 completion predicate；只有 `state=VALIDATED` 不足以归档
- package/runtime/plugin/marketplace/README 版本统一为 `0.2.29`
- release 在任何版本写入、commit、tag、push 前先执行阻断式 prepublish；`claude plugin validate .` 必须零 warning

## 下一步

1. 等待 Claude 账户容量恢复，重新派发 scoped executor 并生成/import Task 2–4 authoritative receipts
2. 重新运行 `HARNESS_LIVE_E2E=1` authenticated clean-target probe
3. 派 verification reviewer，刷新 validation digest
4. 满足统一 completion predicate 后归档 change

本轮不执行 push、tag、GitHub Release 或 npm 发布。
