---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-09-07
implementationRefs:
  - bin/local-quality.mjs
  - runtime/test
  - .github/workflows/platform-smoke.yml
testRefs:
  - runtime/test/ci-workflow-contract-smoke.mjs
  - runtime/test/release-local-transaction-smoke.mjs
  - runtime/test/release-version-acceptance-smoke.mjs
  - runtime/test/verify-run-smoke.mjs
  - runtime/test/installed-verify-plugin-e2e.mjs
  - runtime/test/installed-archive-plugin-e2e.mjs
  - runtime/test/main-lifecycle-standard-sample-smoke.mjs
---

# Testing Contract

必须区分 unit、integration、adversarial、contract 和 external-project acceptance。

行为测试验证进程 exit、stdout/stderr、文件系统结果和 evidence，不以源码 token 代替核心行为。

Verify 的标准验收必须证明 installed plugin 能在真实 `claude -p --plugin-dir` 会话中 fork Verify Skill，
从 Plan 解析冻结命令，通过 runtime runner 执行，产出逐 TC command evidence/canonical receipt，并由
finalizer 持久化 StageResult。仅校验 Skill 文本或本地手写 fixture 不构成该链路的 E2E 证据。

Archive 的标准验收必须从真实 installed plugin fork Archive Skill，生成完整 lineage manifest/runtime
attestation 和 persisted StageResult，再由 fresh 独立 reviewer 产生 ReviewResult；最后只有 runtime
Archive CompletionProof 才能物理移动 change；移动后必须在无 source path、无需 `.git` receipt 的条件下复验
manifest v2 全部 archivePath/digest，之后才能清理 active pointer。

Main 的确定性全生命周期验收必须使用同一 change 连续经过 Clarify→Archive。每个动作前由 fresh 进程
重新读取 `workflow status --json`，后段 fixture 不得覆盖上游 state、task、command 或 completion proof；
Implement 必须包含真实 RED/GREEN/REFACTOR、独立 task review 和受治理 worktree 集成，Archive 移动后必须
离线复验 manifest。各阶段真实安装态 `claude -p` E2E 继续证明模型与 packaged Skill 行为，但不能替代该
连续性测试，也不能伪称需要用户业务决策的单个长会话可以无人值守完成。

RED 必须由目标断言在缺少实现时失败；同一测试在实现后通过。

adversarial 至少覆盖 ID/path escape、symlink、Windows path、混合探索路径、dirty/staged/untracked、generator、invalid JSON、外部命令失败、receipt 重放、agent/run mismatch 和并发更新。

确定性本地 gate 不访问 Context7。`npm run quality:local` 是日常与发布权威入口，覆盖 prepublish、external-project E2E、确定性制品、SBOM、release notes 和解包验收。

GitHub-hosted 平台 matrix 覆盖 Linux、macOS、Windows 与 Node 20/22，但只能由维护者通过 `workflow_dispatch` 按需触发；push、pull request、tag 和 schedule 不得自动消耗 Actions 分钟。在线和人工 upstream review 单独报告。

发布前必须从 allowlisted artifact 解包验收。

## Task 子进程收敛边界

`runtime/task-child.mjs` 的跨平台合同是**有界收敛**，不是针对同一 OS 用户下恶意进程的 sandbox：

- Linux：task command 作为独立 process-group leader 启动；结束时先清理整个 process group，再扫描并清理仍携带当前授权 token 的逃逸进程。
- macOS：保留 process-group 清理，并以 `ps` 环境扫描补充仍携带授权 token 的逃逸进程。
- Windows：以父子进程快照配合 `taskkill /t /f` 清理可归属的进程树。

task command 不继承 runner 的 fd 3 outcome channel。launch error、signal termination、缺失或伪造 outcome 都必须 fail closed，且不能生成 trusted spool 或 canonical receipt。

上述机制保证正常构建/测试命令及其可归属 descendants 不越过 task-run 生命周期；它不能证明已重新建 session/process tree 且主动清除 token 的同用户恶意程序已被隔离。需要抵抗该威胁时必须由宿主提供 cgroup、job object、container 或等价 sandbox，不能把 receipt 解释为 OS sandbox 证明。平台 smoke 必须验证各自声明的收敛路径，不得通过缩弱 fixture 静默跳过。
