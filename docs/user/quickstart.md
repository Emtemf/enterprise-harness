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

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

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
