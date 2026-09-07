---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-09-06
implementationRefs:
  - skills/archive/SKILL.md
  - skills/archive/scripts/prepare-input.mjs
  - skills/archive/scripts/finalize-result.mjs
  - runtime/lib/archive-manifest.mjs
  - runtime/lifecycle.mjs
testRefs:
  - runtime/test/archive-skill-script-smoke.mjs
  - runtime/test/test-cases-downstream-binding-smoke.mjs
  - runtime/test/lifecycle-archive-transition-smoke.mjs
  - runtime/test/installed-archive-plugin-e2e.mjs
---

# Archive Contract

## 目标与边界

Archive 封存已完成 change 的可审计证据链，不重新实现、验证或生成未来知识资产。Archive worker 只生成
StageResult；独立 reviewer、runtime CompletionProof 和 `archive-finalize` 分别负责他检、完成证明和物理移动。

## 冻结输入

canonical Archive Handoff v2 必须 digest-bind：

- `requirements.md`、classification、技术债、project-contract assessment 和 Clarify decision snapshot；
- `design.md`、`test-cases.md`、compound DesignProof；
- `tasks.md`、`task-commands.json`、PlanProof、ImplementProof；
- `validation.md` 和 Verify CompletionProof。

这些是当前企业辅助开发闭环。RAG、代码反推 PDR、自动 lessons 和负知识学习只保留扩展边界，不在
Archive 阶段隐式执行。

## Runtime writer pair

Archive finalizer 先重验 active Archive state、fresh validation 和全部 input digest，再调用 runtime facade。
facade 在 change transaction 内创建 immutable `archive-manifest.json` 与配对 attestation；普通 attestation
写失败会删除本次新建 manifest，既有合法 pair 只允许同 run/input 的幂等读取。

manifest v2 的 `lineage` 按 source `path` 排序，每项同时记录迁移前 `path`、迁移后稳定 `archivePath` 和
digest，且必须与 handoff 的完整 inputDigests 逐项一致。所有输入必须属于当前 change，不能把 `.git` receipt
或 change 外路径伪装成持久归档内容；Test Design 只保留已由 compound DesignProof 认证的 execute/review run ID。
attestation v2 绑定 manifest 的 source/archive 双路径、digest、archive run 和同一 input closure。手写、单边
pair、符号链接、错 run、外部输入或遗漏 lineage 均 fail closed。

## StageResult、审查与移动

finalizer 将全部 lineage、manifest 和 attestation 纳入 Archive StageResult，并通过公开 API 一次性持久化。
Main 随后创建不同 run/identity 的 archive review；reviewer 不读取 worker 对话。

只有 runtime 生成 fresh Archive CompletionProof 后，Main 才能调用 `lifecycle archive-finalize`。该命令先
CAS 更新 lifecycle，再移动 change，并只依赖 `harness/archive/<changeId>` 对每个 `archivePath`、digest、DesignProof
绑定和 writer attestation 执行离线复验；移动或复验失败时目录与 lifecycle 一并回滚。成功后清理 session
binding 和兼容指针。归档目标已存在时禁止覆盖。未完成 change 使用带原因的 `abandon`，不能冒充成功归档。
