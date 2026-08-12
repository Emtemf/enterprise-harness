---
name: harness-verify
description: Enterprise Harness verify 阶段。独立消费 state、artifacts、reviews、TDD receipts、agent ledger、API contract 和 fresh validation，并给出 completion verdict。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness Verify

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

## 上下文边界

你在 forked subagent 中运行，没有主会话历史，也没有和用户对话的通道。

- 权威输入只有 durable artifact、receipt、ledger 和真实命令输出，不是聊天记录。
- 需要用户决策时在 blockers 里写明，交主 orchestrator 去问。
- 你必须派 `verification-executor` 和 `verification-reviewer`；不得自收自审。
- 返回给主 orchestrator 的是 completion verdict 和 blockers，不是 validation 全文。

## 输入（最低要求）

- `state.json`（含 change state 和 revision）
- `requirements.md` / `design.md` / `tasks.md`
- 所有 reviewer verdicts（design-reviewer、plan-critic、implementation-reviewer）
- TDD receipts（`evidence/tdd/<task-id>.json`）
- agent ledger
- validation commands/results

## 动作

1. 生成 verification brief。
2. 创建 execute handoff，派 `verification-executor` 收集真实 validation：
   ```bash
   enterprise-harness handoff create <change-id> verify verify.collect execute
   ```
3. 等 `verify.collect/result.json`，以其 runId 创建 check handoff，派 `verification-reviewer`。
4. API 有变化时，额外走 `verify.check-api`：
   - execute handoff → `verification-executor` 收集 API 契约对照 evidence
   - check handoff（以 execute runId）→ `api-consistency-reviewer`
5. 任一 `block` 或 `unsupported` 不得提升为 pass。

## 完成态最低门槛

| 项目 | 要求 |
|------|------|
| validation.status | `fresh`（必须由 `lifecycle validated` 重算，写 state.json 无效） |
| reviewer verdicts | design-reviewer、plan-critic、implementation-reviewer 全部 pass 或 advisory |
| TDD receipts | 所有 task 有导入的 `evidence/tdd/<task-id>.json` |
| API contract（适用） | api-consistency-reviewer pass |
| checker | verification-reviewer 与 verification-executor 必须是不同 run |

## Completion Verdict 语义

| verdict | 含义 | blockers |
|---------|------|---------|
| `pass` | 允许推进到 archive | 空数组 |
| `advisory` | 不阻断但有补强建议 | 可为空 |
| `block` | 明确阻断 | 非空，含具体返工步骤 |

## 产出

- `validation.md`（fresh validation evidence）
- API verdict（适用时）
- verification verdict（`check.json`）
- completion verdict + blockers + consumed evidence summary + next step

## 阻断条件

- validation stale（必须先跑 `lifecycle validated`）
- receipt 或 reviewer verdict 缺失
- checker 与 executor 同 run
- API parser 无法解析却声称 pass
- 只检查 `state=VALIDATED` 而不消费 reviewer/receipt

## 下一阶段

completion pass 后，主 orchestrator 依次执行：

```bash
enterprise-harness lifecycle validated <change-id>
enterprise-harness workflow decide <change-id> enter-archive
```

第一条重算 digest 并置 `validation.status=fresh`；第二条推进到 archive。
`validation.status` 不是 `fresh` 时 `enter-archive` 不出现。
返工用 `revise-verification`（会把 validation 置回 stale）。
