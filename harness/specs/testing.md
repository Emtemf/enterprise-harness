---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - runtime/test
  - .github/workflows/platform-smoke.yml
testRefs:
  - runtime/test/task4-release-acceptance-smoke.mjs
---

# Testing Contract

必须区分 unit、integration、adversarial、contract 和 external-project acceptance。

行为测试验证进程 exit、stdout/stderr、文件系统结果和 evidence，不以源码 token 代替核心行为。

RED 必须由目标断言在缺少实现时失败；同一测试在实现后通过。

adversarial 至少覆盖 ID/path escape、symlink、Windows path、混合探索路径、dirty/staged/untracked、generator、invalid JSON、外部命令失败、receipt 重放、agent/run mismatch 和并发更新。

确定性 CI 不访问 Context7。平台 matrix 覆盖 Linux、macOS、Windows 与 Node 20/22。在线和人工 upstream review 单独报告。

发布前必须从 allowlisted artifact 解包验收。
