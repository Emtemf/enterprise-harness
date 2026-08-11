# 阶段推进决策

用 `enterprise-harness workflow status <change-id>` 读 `pendingDecision.options`（唯一权威决策集合）；不在其中的决策直接失败。

| 阶段 | pass 决策 | block/返工决策 | 推进 gate |
|---|---|---|---|
| clarify | `confirm-clarity`，随后 `confirm-scope` | `narrow-scope` / `revise-scope` | `clarifyReady` + `userConfirmedScope` |
| route | `confirm-route` | `revise-route` | `routeReady` |
| design | `approve`（或 `freeze-slice`） | `request-changes` / `reject` / `revise-slice` | `designApproved` |
| plan | `freeze-plan` | `revise-plan` | `planReady` |
| tdd | `enter-verify` | `revise-task` | `tddStatus === 'refactor-verified'` |
| verify | 先 `lifecycle validated`，再 `enter-archive` | `revise-verification` | `validation.status === 'fresh'` |

**注意**：
- `confirm-clarity` 只置 `clarifyReady`；scope 须用户单独 `confirm-scope`。
- `tddStatus` 由真实 receipt 驱动，不接受 worker 自报。
- `validation.status` 由 `lifecycle validated` 重算，写 state.json 无效。
- executor 与 checker 必须是不同 subagent/run；worktree 只隔离文件，subagent 隔离上下文。
