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

## 输入

- change state 和 revision
- requirements/design/tasks
- all reviewer verdicts
- TDD receipts 与 implementation commits
- agent ledger
- validation commands/results

## 动作

1. 生成 verification brief。
2. 派 `verification-executor` 收集真实 validation。
3. API 变化时派 `api-consistency-reviewer`。
4. 派 `verification-reviewer` 独立检查 completion。
5. runtime 分层验证 state、artifacts、reviews、TDD、ledger、API 和 final completion。
6. 任一 `block` 或 `unsupported` 不得提升为 pass。

## 产出

- `validation.md`
- validation evidence/digest
- API verdict（适用时）
- verification verdict
- completion verdict、blockers、consumed evidence、next step

## 阻断

- validation stale
- receipt 或 reviewer 缺失
- checker 与 executor 同 run
- API parser 无法解析却声称 pass
- 只检查 `state=VALIDATED`

## 下一阶段

completion pass 后，主 orchestrator 必须执行：
```bash
enterprise-harness lifecycle validated <change-id>
enterprise-harness workflow decide <change-id> enter-archive
```
第一条命令重算 validation digest 并把 `validation.status` 置为 fresh；第二条推进到 archive 阶段。
validation 不是 fresh 时 `enter-archive` 不会出现。需要返工用 `revise-verification`（会把 validation 置回 stale）。
详细合同见 `harness/specs/verify-contract.md`。
