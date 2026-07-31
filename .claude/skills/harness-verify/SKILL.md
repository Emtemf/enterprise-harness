---
name: harness-verify
description: Enterprise Harness verify 阶段。独立消费 state、artifacts、reviews、TDD receipts、agent ledger、API contract 和 fresh validation，并给出 completion verdict。
---

# Harness Verify

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

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

completion pass 才进入 archive。详细合同见 `harness/specs/verify-contract.md`。
