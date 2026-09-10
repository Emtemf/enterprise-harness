# Enterprise Harness

Enterprise Harness 是面向 Claude Code 的软件变更验收控制层。它不负责让模型“显得更聪明”，而是把需求、证据、设计、实现、验证和归档绑定成 runtime 可重新计算、可拒绝、可恢复的交付协议。

核心承诺只有一句：

> stale、越权、自我批准或缺少证据的工作，不能成为“已验收结果”。

## 为什么需要它

Skill 可以教 agent 使用优秀方法，规格文档可以保存设计，但它们不能单独阻止模型把未确认假设写进代码、复用 stale 结论、用聊天代替命令证据、在同一上下文自我批准，或在中断后猜测进度。

Enterprise Harness 将这些情况转换为稳定 blocker 和唯一恢复动作。只有 fresh digest、正确 agent/run 身份、机器命令 receipt、独立 review 与完整 lineage 同时满足时，runtime 才允许进入下一个已验收状态。

## 适合谁

| 适合 | 不适合 |
|---|---|
| Claude Code 中跨接口、数据、测试或多服务的高风险变更 | 只追求第一次回答或原型生成速度 |
| 返工/审计成本高于前置取证成本 | 低风险、一次性、无需审计的小改动 |
| 需要中断恢复、独立审查和离线复验 | 需要多 agent harness 通用工作流 |
| 不接受模型自报测试通过 | 希望插件替代 CI/CD、权限或安全平台 |

当前默认项目 profile 针对 Java、Spring Boot 与 Maven，但路径、命令和构建边界可通过 `harness/project.json` 调整。Claude Code-only 是明确产品边界，不是待兼容列表。

## 与普通 Skill 或规格工具的差异

| 类型 | 主要解决 | Enterprise Harness 额外负责 |
|---|---|---|
| 工程方法 Skill | 教 agent 如何澄清、设计、TDD 和 review | agent 偏离方法时，由 runtime 阻止无证据 transition |
| 规格资产工具 | 保存 proposal、spec、design 和 tasks | 输入变化后机械失效旧 proof，并重新计算最早 blocker |
| Enterprise Harness | Claude Code 内的 acceptance control plane | 绑定事实、用户决定、身份、命令、review、freshness 与 archive lineage |

企业评估应先比较正确产出、无效验收拒绝、恢复能力和可复验证据，再观察 token、耗时与工具调用量。Superpowers 更轻且方法成熟，OpenSpec 更流动且跨工具；Harness 用更多前置计算换取 runtime 强制验收。当前证据可以证明机械门禁存在，尚不能证明绝对更省 token 或总体 ROI 更高。当前 CC Switch 评测检验“GLM-5.1 controller + GLM-5.2 专项 workers + Harness”能否达到裸 GLM-5.2 的产品效果；成本优势单独等待 provider 真实账单，以免把 Claude alias 估值冒充实际支出。完整交付物、模型经济学和证据状态见[企业价值与选型](docs/marketing/competitive-evidence.md)。

## 已有证据

仓库提供两类不能互相替代的证据：

- `npm run benchmark:governance`：确定性注入 stale pending question、stale Clarify 工件、测试设计变更、越权写入和缺 CompletionProof 等失败；同时执行完整 Clarify→Archive 成功样例，避免“全部拒绝”的伪安全。
- fresh `npm pack` + `claude -p --plugin-dir`：验证真实 Claude Code 是否加载发布态 Skill、Agent、Hook 与 runtime，而不是只验证源码函数。

当前失效注入基线为 5/5 类无效状态被拒绝、1/1 条完整 lineage 被接受。它证明 Harness 自己的 runtime enforcement，不代表竞品在同样场景中必然失败。完整生命周期 token 与业务 ROI 仍需重复真实项目样本。

## 工作方式

生命周期固定为：

```text
clarify → design → plan → implement → verify → archive
```

| 阶段 | 可观察合同 |
|---|---|
| Clarify | CodeGraph/Context7 先完成适用事实；主会话再按 component × Goal / Scope / Constraints / Acceptance / Context 的证据覆盖一次问一个用户决定，选择进入 digest-bound Decision Ledger |
| Design | architecture execute/review/seal 后，独立 test-design execute/review；两条 fresh 链形成 compound `DesignProof` 与权威 `test-cases.md` |
| Plan | 同时冻结人读 `tasks.md` 和机器 `task-commands.json`，包含测试映射、策略、literal argv 与 write scope |
| Implement | 具名 implementer 在 worktree 中通过 runner 生成 receipt；不同 run/identity 的 reviewer 审查后才能精确集成 |
| Verify | 按 accepted `TC*` 重放 Plan 冻结命令；手写日志、Implement receipt 或聊天不能代替验证 receipt |
| Archive | 独立审查完整 fresh lineage 后原子移动，并仅从归档目录离线复验 |

详细阶段、不变量和失败恢复见[用户工作流](docs/user/workflow.md)。

## 安装

要求：

- Claude Code 2.1.219 或更高版本；最近验证版本为 2.1.263；
- Node.js 20 或 22；
- Git；
- CodeGraph MCP；
- Java 项目建议提供 Maven Wrapper；
- Context7 MCP 由插件声明，可选使用 `CONTEXT7_API_KEY`；锁定版本 CLI 只作受控 fallback。

从 GitHub marketplace 安装：

```bash
claude plugin marketplace add Emtemf/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

本仓库为 private 时，Claude Code 的 marketplace 后台更新不能弹出 GitHub 登录窗口。每位使用者必须先拥有访问权限，并确保 Git 可以无交互读取仓库：

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
git ls-remote https://github.com/Emtemf/enterprise-harness.git
```

最后一条必须输出 refs。`Cannot prompt because user interactivity has been disabled`、`unable to get password` 或 `Failed to clone marketplace repository` 表示 Git 凭据未就绪，不是插件 release 不存在。

本地 checkout 开发安装：

```bash
claude plugin marketplace add /absolute/path/to/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

## 开始一次变更

在目标项目的 Claude Code 会话运行：

```text
/enterprise-harness:harness
```

然后直接描述业务变更。不要先手工创建 design 或 task；Harness 会创建或恢复 active change，读取 durable 状态并执行一个当前合法动作。

遇到中断时，优先看结构化状态，而不是根据聊天继续：

```bash
enterprise-harness status
enterprise-harness workflow status <change-id> --json
enterprise-harness workflow audit <change-id> --json
enterprise-harness trace --change <change-id> --mermaid
```

稳定读取顺序是：

```text
status → nextAction → pendingDecision → evidence refs
```

`status=blocked` 时只执行 `nextAction` 指定的恢复动作；非阻断的用户选择只来自 `pendingDecision.options`。不要按聊天中的阶段名称猜测下一步，也不要直接修改 `state.json`。

## 更新与卸载

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
claude plugin uninstall enterprise-harness@enterprise-harness --scope local
```

安装和更新必须使用相同 scope。私有 marketplace 更新失败时，先重新验证 `git ls-remote`，不要反复重试插件命令。

## 当前限制

- 仅承诺 Claude Code host；
- 默认 acceptance fixture 以 Java/Spring/Maven 为主，其他语言需要项目 profile 和真实验证；
- OpenAPI 与 Spring Controller 检查仍可能对复杂结构返回 `unsupported`；
- Context7 是首选资料入口，不是高于官方源码和文档的最终权威；
- Hook 只负责轻量 host-boundary gate，不能替代操作系统 sandbox 或仓库权限；
- 跨主机共享文件系统仍需要外部协调；
- 当前第一轮澄清 token、耗时和成本高于已完成的单次 Superpowers/OpenSpec pilot，不能宣传为绝对省 token。

完整限制见[已知限制](docs/user/limitations.md)。

## 文档

- [快速开始](docs/user/quickstart.md)
- [开始一次受治理的变更](docs/user/getting-started.md)
- [用户工作流](docs/user/workflow.md)
- [故障排查](docs/user/troubleshooting.md)
- [阶段证据与实际时序](harness/specs/stage-observability.md)
- [维护架构](docs/maintainer/architecture.md)
- [文档治理](docs/maintainer/documentation-governance.md)
- [长期规范索引](harness/specs/README.md)
- [贡献指南](CONTRIBUTING.md)
License：Apache-2.0，见 [LICENSE](LICENSE)。
