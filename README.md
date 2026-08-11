# Enterprise Harness

Enterprise Harness 是面向 Claude Code 的早期工程治理插件。它把需求澄清、代码探索、设计、计划、真实 TDD、独立检查、验证和归档组织成可恢复、可诊断的 staged workflow。

它适合希望在 Java/Spring Boot/Maven 项目中约束 agent 行为的团队，尤其适合以下场景：

- 需求经常存在歧义，需要先澄清再实现。
- 希望代码探索由隔离的只读 subagent 完成。
- 希望 executor 与 checker 上下文隔离，并留下结构化 handoff。
- 希望 TDD 真实执行项目 Maven 命令，而不是只生成测试文本。
- 希望 hooks 能阻止越阶段写入，并给出稳定错误码和恢复动作。

## 当前支持范围

当前主要支持：

- Claude Code plugin。
- Java、Spring Boot、Maven 项目；路径和构建边界可通过 `harness/project.json` profile v1 调整。
- `src/main/java/**`、`src/test/java/**`、`openapi/**` 默认约定路径。
- CodeGraph-first 代码探索，关键事实在当前源码中做 scoped confirmation。
- Context7 MCP-first 外部库和框架资料查询；未配置或不可用时记录 fallback/degraded 状态并使用官方文档。
- State v5、session binding、change lock、artifact stale propagation 和 controlled rewind。
- 0.4 目标 happy path：`clarify → classify → design → plan → implement → verify → archive`；当前 runtime 暂保留 `route` / `tdd` 兼容投影。
- executor/checker 独立 subagent、结构化 handoff 和 agent ledger。
- Claude Code 原生 `worktree.baseRef=head`，worktree 只做代码隔离，不承载 change 真相。
- 同一 Claude Code plugin 的 Linux、macOS、Windows deterministic CI；实际状态以 GitHub Actions 为准。

“Claude Code-only” 是当前明确的产品边界：暂不设计 Codex、OpenCode、Gemini CLI 等其他
agent harness 的兼容层。操作系统测试矩阵只是 Claude Code plugin 自身的可移植性验证。

当前仍是早期治理框架。它不替代 CI/CD、人工代码审查、安全扫描、制品签名、权限平台或生产发布审批。OpenAPI 检查已具备基础门禁，但复杂 YAML 和 Spring 映射仍可能返回 `unsupported`，不能视为完整 API 治理平台。

## 五分钟安装

要求：

- Claude Code 2.1.218 或更高版本（当前验证版本：2.1.227）
- Node.js 20 或 22
- Git
- Java 项目建议提供 Maven Wrapper
- CodeGraph MCP；需要外部文档时配置 Context7 MCP 与 `CONTEXT7_API_KEY`，未配置时可使用官方文档 fallback。

从 GitHub marketplace 安装：

```bash
claude plugin marketplace add Emtemf/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

### 私有 GitHub marketplace

本仓库为 private 时，Claude Code 更新 marketplace 会在后台运行非交互式 Git；它不能弹出
GitHub 登录窗口。因此每位使用者都必须先拥有仓库访问权限，并让本机 Git 能无提示读取 GitHub。

Windows PowerShell、macOS 或 Linux 终端中执行：

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
git ls-remote https://github.com/Emtemf/enterprise-harness.git
```

最后一条必须能输出 refs，才安装或更新插件。若出现 `Cannot prompt because user interactivity
has been disabled`、`unable to get password` 或 `Failed to clone marketplace repository`，说明 Git
凭据尚未配置好，不是插件版本或 release 附件问题。配置完成后使用：

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

`--scope local` 必须与安装 scope 一致；省略它可能会让 Claude Code 错误地去 user scope 查找插件。

本地开发 checkout：

```bash
claude plugin marketplace add /absolute/path/to/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

安装完成后，在目标项目的 Claude Code 会话中运行：

```text
/enterprise-harness:harness
```

## 最小使用示例

用户可以直接描述需求：

```text
为订单服务增加取消订单 API；只有待支付订单可取消，并记录取消原因。
```

插件会：

1. 创建或恢复 active change。
2. 派 `code-explore` 只读 subagent 获取代码事实。
3. 按七维歧义评分逐项澄清，并要求用户确认 scope。
4. 生成含接口、错误模型和必要 SQL 的 design。
5. 冻结任务级 exact argv。
6. 在隔离 TDD executor 中执行 RED、GREEN、REFACTOR。
7. 派独立 checker，消费 result 而不是 executor 的聊天上下文。
8. 汇总 fresh validation 和 completion evidence 后才允许归档。

## 用户会看到什么

每个阶段返回简短状态：

```text
change: add-order-cancel-api
stage: clarify
ambiguity: 27/35
weakest: acceptanceCriteria=3
next: answer one scope question
```

出现阻断时会返回稳定错误码、原因和恢复动作，例如：

```text
EH-TDD-RECEIPT-007
```

诊断不要求提供 Claude 的完整思考过程。提交 issue 时请附：

- 错误码和恢复提示。
- `enterprise-harness status --json` 的非敏感输出。
- 对应 change 的 `state.json`、runId 和已脱敏 ledger 片段。
- 操作系统、Node、Java、Maven 和插件版本。

插件验收不会检查 Claude 账户、订阅、认证或服务容量。CI 安装 Claude Code CLI 仅用于 `claude plugin validate`。

## 更新与卸载

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
claude plugin uninstall enterprise-harness@enterprise-harness --scope local
```

## 文档

- [文档索引](docs/README.md)
- [快速开始](docs/user/quickstart.md)
- [用户工作流](docs/user/workflow.md)
- [查看阶段证据与实际时序](harness/specs/stage-observability.md)
- [故障排查](docs/user/troubleshooting.md)
- [已知限制](docs/user/limitations.md)
- [维护架构](docs/maintainer/architecture.md)
- [规范索引](harness/specs/README.md)
- [贡献指南](CONTRIBUTING.md)

## License

Apache-2.0，见 [LICENSE](LICENSE)。
