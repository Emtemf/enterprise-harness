# Archive 制品合同

```text
frozen lifecycle artifacts + Design/Plan/Implement/Verify proofs
  → runtime archive-manifest.json
  → runtime archive-manifest-attestation.json
  → persisted Archive StageResult
  → independent ReviewResult
  → runtime Archive CompletionProof
  → atomic directory move
```

- handoff 必须摘要绑定 requirements、classification、debt/project-contract assessments、decision snapshot、
  design、test cases、tasks、task commands、Design/Plan/Implement/Verify CompletionProof 和 validation。
- manifest v2 的 `lineage` 按 source path 排序，逐项绑定 handoff 的 source path、稳定 archivePath 与 digest；
  输入必须属于当前 change，不能省略、添加漂移项或依赖 `.git` receipt。
- attestation 绑定 manifest digest、archive run 和完整 inputDigests；二者属于同一个受锁 runtime writer transaction，普通写失败会回滚本次新 manifest。
- StageResult 同时绑定全部 lineage、manifest 和 attestation，并由 finalizer 持久化到 canonical run result。
- 归档后的目录内容不可再由 Skill 修改；writer attestation 证明 runtime 路径，不是对恶意文件系统所有者的签名。
