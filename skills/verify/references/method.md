# Verify method

在执行 validation plan 前读取。Verify 从风险和 claim 出发选择证据，不以“CI 绿”替代完成判断。

## Workflow

1. 列出本 change 的 claims：功能、兼容、数据、安全、可靠性、运维与 release surface。
2. 将每个 claim 映射到最便宜但足够有力的 evidence；高风险 claim 需要更接近真实 consumer 的测试。
3. 执行 frozen argv，保留 fail/skip/unsupported 与环境限制，不选择性报告。
4. 检查 negative paths、边界、rollback/recovery 和适用安全 controls。
5. 对 claim/evidence 做 coverage review；缺口是 blocker、显式 waiver 或 `N/A + reason`。

## Decision lenses

- **Risk proportionality**：验证强度匹配影响和 reversibility，而不是每项都跑同一模板。
- **Layer fit**：unit 定位逻辑，integration 验证边界，E2E 只覆盖关键 consumer journey。
- **Independence**：验证证据来自真实进程和独立 review，不来自 executor 叙述。
- **Freshness**：输入、tree、命令或 receipt 变化后，旧结论不能复用。
- **Operational proof**：适用时验证 migration、startup、observability、degraded mode 与恢复。
- **Security specificity**：按 classification 选择 version-bound control，不用笼统“安全检查”。

## Failure modes

- 只跑新增 happy-path unit test，遗漏 consumer、migration 或 error contract。
- 把 skipped/unsupported 当成通过，或只引用日志片段不记录 argv/exit。
- 用测试数量、覆盖率百分比替代风险覆盖解释。
- validation.md 复制命令输出，却没有 claim-to-evidence 映射。
- 安全 impact=yes，但没有对应 ASVS/NIST control 或 threat-specific evidence。

## Sources

- [NIST SSDF SP 800-218](https://csrc.nist.gov/projects/ssdf)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [Google Engineering Practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
