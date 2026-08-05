# 快速开始

## 前置要求

- Claude Code
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

描述一个具体需求。插件会先探索事实和澄清，不会直接修改业务代码。

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
它比聊天进度可靠。完整阶段说明见[七阶段工作流](workflow.md)与
[阶段时序、事件与产物合同](../../harness/specs/stage-observability.md)。

`doctor` 默认离线。只有显式运行 `doctor --online` 才检查 Context7 网络能力。
