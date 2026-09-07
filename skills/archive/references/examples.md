# Archive 标准样例

## 有效

Main 创建 archive handoff，完整绑定 requirements、治理制品、Design/Plan/Implement/Verify proofs、tasks、
test cases 和 validation。worker 原样运行 prepare 与 finalizer；runtime 生成 manifest/attestation 并持久化
StageResult。不同 reviewer pass 后，Main 调用 `archive-finalize`，change 被原子移动且 active pointer 清理。

## 无效

- 只把 `validation.md` 和 VerifyProof 放进 handoff：缺少可审计 lineage。
- worker 手写 manifest 或补造 attestation：没有 runtime writer provenance。
- prepare 成功后因额外 `cat`/`ls`/`find` 被 Bash hook 拒绝，就宣称 finalizer 不可用并手拼 StageResult：误把无关诊断拒绝当 canonical writer 失败。
- finalizer 成功后 worker 自行调用 `archive-finalize`：越过 Main 的独立 review。
- 目标目录已存在仍覆盖历史：破坏不可变归档。
- 把未完成 change 当已完成归档；正确动作是由 Main 选择修复或带原因 `abandon`。
