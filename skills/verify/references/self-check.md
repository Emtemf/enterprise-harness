# Verify Self-Check

- [ ] handoff 同时 digest-bind DesignProof、PlanProof、ImplementProof、test-cases、tasks 与 task-commands。
- [ ] 每个 accepted TC 都有且只有一个明确状态；critical E2E 已真实执行。
- [ ] 每个 executed TC 引用当前 run 的 canonical command evidence JSON。
- [ ] evidence 中的 task、phase、argv 与冻结 Plan 完全一致，全部命令 exit 0。
- [ ] stdout/stderr ref 可读且 digest 新鲜；没有手写或复制 runtime-owned evidence。
- [ ] validation Commands 表逐项来自 evidence，Results 有可观察业务结果。
- [ ] skip、unsupported、waiver、N/A 与失败均显式保留；unsupported 未被提升为 pass。
- [ ] TECPC 的 Target、Evidence、Context、Path、Correction 与本次 handoff 一致。
- [ ] finalizer 已原子持久化 StageResult；worker 未自行 review、迁移 stage 或宣布完成。
