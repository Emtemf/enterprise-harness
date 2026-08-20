---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-21
implementationRefs:
  - runtime/test
  - runtime/test/suite-manifest.mjs
  - .github/workflows/core-quality.yml
  - .github/workflows/skill-quality.yml
  - .github/workflows/platform-smoke.yml
testRefs:
  - runtime/test/task4-release-acceptance-smoke.mjs
  - runtime/test/skill-content-contract-smoke.mjs
  - runtime/test/smoke-profile-contract-smoke.mjs
---

# Testing Contract

必须区分 unit、integration、adversarial、contract 和 external-project acceptance。

行为测试验证进程 exit、stdout/stderr、文件系统结果和 evidence，不以源码 token 代替核心行为。

RED 必须由目标断言在缺少实现时失败；同一测试在实现后通过。

adversarial 至少覆盖 ID/path escape、symlink、Windows path、混合探索路径、dirty/staged/untracked、generator、invalid JSON、外部命令失败、receipt 重放、agent/run mismatch 和并发更新。

确定性 CI 不访问 Context7。流水线按风险分层，不按历史测试数量设计：

- `core-quality` 在 canonical Linux + Node 22 上一次性运行完整 deterministic/prepublish 合同；
- `skill-quality` 独立验证 Claude Code 原生 packaging、内容方法、行为场景与 plugin metadata；
- `platform-smoke` 只在 Linux/macOS/Windows 和 Node 20/22 的代表性组合上运行路径、进程、launcher、
  worktree 与 lock 等平台敏感合同；
- release 再运行完整 prepublish，在线和人工 upstream review 单独报告。

禁止为了矩阵整齐把完整 smoke suite 复制到每个 OS/Node 组合。新增测试必须先判断属于 full、skill、
platform 或 external-project 哪一层；profile 引用不存在的测试必须 fail closed。

发布前必须从 allowlisted artifact 解包验收。

## Task 子进程收敛边界

`runtime/task-child.mjs` 的跨平台合同是**有界收敛**，不是针对同一 OS 用户下恶意进程的 sandbox：

- Linux：task command 作为独立 process-group leader 启动；结束时先清理整个 process group，再扫描并清理仍携带当前授权 token 的逃逸进程。
- macOS：保留 process-group 清理，并以 `ps` 环境扫描补充仍携带授权 token 的逃逸进程。
- Windows：以父子进程快照配合 `taskkill /t /f` 清理可归属的进程树。

task command 不继承 runner 的 fd 3 outcome channel。launch error、signal termination、缺失或伪造 outcome 都必须 fail closed，且不能生成 trusted spool 或 canonical receipt。

上述机制保证正常构建/测试命令及其可归属 descendants 不越过 task-run 生命周期；它不能证明已重新建 session/process tree 且主动清除 token 的同用户恶意程序已被隔离。需要抵抗该威胁时必须由宿主提供 cgroup、job object、container 或等价 sandbox，不能把 receipt 解释为 OS sandbox 证明。平台 smoke 必须验证各自声明的收敛路径，不得通过缩弱 fixture 静默跳过。
