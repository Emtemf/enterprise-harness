# 快速开始

## 前置要求

- Claude Code 2.1.219 或更高版本（`background: false` 与 nested subagent 所需）
- Git
- Node.js 20 或 22
- Java 项目建议提供 `./mvnw`
- CodeGraph

## 安装

```bash
claude plugin marketplace add Emtemf/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

### 使用私有 GitHub marketplace

`enterprise-harness` 是 private repository。安装前，每位使用者都需要有 GitHub 仓库访问权限，
且 Git 必须能在非交互模式下读取凭据；Claude Code 的 marketplace 更新不会弹出登录窗口。

在 Windows PowerShell、macOS 或 Linux 终端执行：

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
git ls-remote https://github.com/Emtemf/enterprise-harness.git
```

仅当最后一条输出 refs 时再继续。它失败或提示以下信息时，先修复 GitHub Git 凭据：

```text
Cannot prompt because user interactivity has been disabled
fatal: unable to get password from user
Failed to clone marketplace repository
```

这表示 Git 无法读取 private repo，不是 plugin release 不存在。


本地仓库开发：

```bash
claude plugin marketplace add /absolute/path/to/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

## 第一次运行

在目标项目打开 Claude Code：

```text
/enterprise-harness:harness
```

描述一个具体需求。插件先让 CodeGraph/Context7 事实 worker 完成适用的代码与外部文档探索；全部
required ResearchPacket 校验并持久化后，主会话才开始澄清，不会把路径或版本事实问给用户，也不会
直接修改业务代码。澄清阶段用 Claude Code 的 `AskUserQuestion` 以选项题收敛最弱的一个 Decision；
回答一轮后再继续下一轮，不需要一次写长篇需求。

阶段 skill 会在每步标出 `Expect`（应产生什么）和 `Verify`（如何确认），并为冻结命令、TDD receipt 和 handoff 结果提供短 few-shot。主会话只保留 changeId、当前缺口、证据摘要和一个下一动作；完整证据写入 change 目录。

## 更新

先确认 private marketplace 的 Git 凭据仍可用：

```bash
git ls-remote https://github.com/Emtemf/enterprise-harness.git
```

然后更新。安装在 local scope 时必须保留 `--scope local`：

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

若 marketplace update 出现非交互认证错误，重新运行上面的 `gh auth login` 和
`gh auth setup-git`，不要反复重试 plugin update。

## 卸载

```bash
claude plugin uninstall enterprise-harness@enterprise-harness --scope local
```

## 最小排查

```bash
enterprise-harness status
enterprise-harness doctor
enterprise-harness workflow status --json
enterprise-harness workflow audit
enterprise-harness trace --change <change-id> --mermaid
```

`workflow audit` 会交叉检查阶段 artifact、state、executor/checker handoff 和 agent ledger；
它比聊天进度可靠。完整阶段说明见[六阶段工作流](workflow.md)与
[阶段时序、事件与产物合同](../../harness/specs/stage-observability.md)。

两个 status 命令都应先读取顶层 `status`。若为 `blocked` 且 `nextAction` 不等于当前 `nextEntry`，只执行该
pre-entry recovery；不要按投影的 `stage` 或 `nextStage` 直接推进。`nextAction=/harness` 只是当前入口，
nested Clarify readiness 由 Harness controller 路由。

`doctor` 默认离线。只有显式运行 `doctor --online` 才检查 Context7 网络能力。
