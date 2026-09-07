# Archive Self-Check

- [ ] exact archive execute handoff、agent、run、state 与 fresh validation 均匹配。
- [ ] required lineage 全部存在、无 symlink 逃逸且 digest 新鲜。
- [ ] 每个 lineage 项同时具有 canonical source path、稳定 archivePath 与 digest，且不存在 change 外输入。
- [ ] Design、Plan、Implement、Verify proofs 和 test cases/validation 均在 frozen inputs 中。
- [ ] Clarify decision snapshot、技术债和项目长期契约处置已显式进入 lineage。
- [ ] manifest/attestation 来自 runtime facade，runId、inputDigests 和 manifest digest 一致。
- [ ] StageResult 已由 finalizer 持久化，worker 没有自行 review 或移动目录。
- [ ] stale、unsupported、waiver、目标冲突、测试引用和恢复风险没有被提升为 pass。
- [ ] TECPC 与 handoff 一致，correction 为 null；下一步仅是独立 review。
