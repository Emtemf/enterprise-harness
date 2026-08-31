# Enterprise Harness

Enterprise Harness 是面向 Claude Code 的工程治理插件。它把需求澄清、代码探索、设计、计划、实现、验证和归档组织成可恢复、可诊断的 staged workflow。

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
- State v6、session binding、change lock、artifact stale propagation。
- 六阶段 happy path：`clarify → design → plan → implement → verify → archive`。
- `design` 仍是一个生命周期阶段，但内部固定执行 architecture 产出与独立 review、seal、独立 `test-design` 产出与 review，随后由 runtime 形成 compound `DesignProof`。
- 详细测试用例的唯一权威是独立的 `test-cases.md`；Plan、Verify 和 Archive 都消费其当前摘要绑定版本。
- executor/checker 独立 subagent、结构化 handoff 和 agent ledger。
- Claude Code 原生 `worktree.baseRef=head`，worktree 只做代码隔离，不承载 change 真相。
- 本地 `quality:local` 发布门禁，以及按需手动触发的 Linux、macOS、Windows 兼容性 matrix。

“Claude Code-only” 是当前明确的产品边界：暂不设计 Codex、OpenCode、Gemini CLI 等其他
agent harness 的兼容层。操作系统测试矩阵只是 Claude Code plugin 自身的可移植性验证。

当前仍是早期治理框架。它不替代 CI/CD、人工代码审查、安全扫描、制品签名、权限平台或生产发布审批。OpenAPI 检查已具备基础门禁，但复杂 YAML 和 Spring 映射仍可能返回 `unsupported`，不能视为完整 API 治理平台。

## 五分钟安装

要求：

- Claude Code 2.1.219 或更高版本（当前验证版本：2.1.227）
- Node.js 20 或 22
- Git
- Java 项目建议提供 Maven Wrapper
- CodeGraph MCP；需要外部文档时配置 Context7 MCP，无需 API Key（匿名可用，有 Key 时从环境变量 `CONTEXT7_API_KEY` 读取以获取更高额度）。

从 GitHub marketplace 安装：

```bash
claude plugin marketplace add Emtemf/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

### 私有 GitHub marketplace

本仓库为 private 时，Claude Code 更新 marketplace 会在后台运行非交互式 Git；它不能弹出 GitHub 登录窗口。因此每位使用者都必须先拥有仓库访问权限，并让本机 Git 能无提示读取 GitHub。

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
2. 派 CodeGraph-first `code-explore` 与适用的 Context7-first `doc-research` subagent，并等待全部
   required ResearchPacket 校验、持久化完成。
3. Main 综合事实后，按 component × 5 核心维度（Goal / Scope / Constraints / Acceptance / Context）
   逐项澄清剩余 Decisions。
4. 生成含接口、错误模型和必要 SQL 的 architecture design，并完成独立 review 和 seal。
5. 独立生成可追踪的 `test-cases.md`，完成独立 review 后形成 compound `DesignProof`。
6. 同时冻结人类可审查的 `tasks.md` 与 runtime 可执行的 `task-commands.json`，逐 task 绑定 `TC*`、strategy、phase、literal argv 和 write scope。
7. 在隔离 worktree 中按 task strategy 执行（TDD / regression / direct 等）。
8. 派独立 checker，消费 result 而不是 executor 的聊天上下文。
9. 汇总每个 `TC*` 的 fresh validation、completion evidence 后才允许归档。

## 用户会看到什么

每个阶段返回简短状态：

```text
change: add-order-cancel-api
stage: clarify
overall: 3.2/5.0
weakest: Refund × Goal (2)
next: 一个关于退款策略的问题
```

出现阻断时会返回稳定错误码、原因和恢复动作，例如：

```text
EH-TASK-RECEIPT-025 / EH-WORKFLOW-STAGE-GATE-007 / EH-AGENT-BINDING-003
```

诊断不要求提供 Claude 的完整思考过程。提交 issue 时请附：

- 错误码和恢复提示。
- `enterprise-harness status --json` 的非敏感输出。
- 对应 change 的 `state.json`、runId 和已脱敏 ledger 片段。
- 操作系统、Node、Java、Maven 和插件版本。

插件验收不会检查 Claude 账户、订阅、认证或服务容量。本地质量门禁调用 Claude Code CLI 仅用于 `claude plugin validate`。

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
