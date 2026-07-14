# Plugin Runtime 规范

## 目标

把当前以仓库为中心的 harness，拆成：

1. **项目共享契约层**（repo contract）
2. **机器本地运行层**（portable runtime / plugin adapter）

这样同一套 harness 才能在 Windows、macOS、Linux 和不同开发机之间“活起来”，而不只是当前 Linux 会话里可用。

## 两层模型

### A. 项目共享契约层
提交到仓库，团队共享：

- `CLAUDE.md`
- `.claude/rules/`
- `.claude/agents/`
- `.claude/skills/`
- `harness/specs/`
- `harness/templates/`
- `harness/config.yaml`
- `.mcp.json`（仅无密声明）

### B. 机器本地运行层
每台机器自己适配：

- 本地环境变量 / secrets
- 本地 shell / OS 差异
- 本地 codegraph / context7 / runtime 可用性
- 本地 hook adapter
- 本地 bootstrap / doctor / sync / upgrade

## 当前问题

目前仓库虽已有可用骨架，但运行层仍偏向：

- bash-only
- Linux-friendly
- 当前会话可用

这不足以构成跨平台、跨机器的“活插件”。

## 插件最小能力

### CLI façade
对安装者暴露单一命令面，例如：

```bash
node harness/plugin/runtime/cli.mjs <command>
```

当前应至少收拢：

- `bootstrap`
- `doctor`
- `sync`
- `install`
- `setup-local-adapter`
- `upgrade`
- `migrate`

### bootstrap
负责一台新电脑的接入检查：

- Node 是否存在
- codegraph / ctx7 wrapper 是否存在
- `.claude/` contract 是否完整
- `.mcp.json` 是否存在
- 必需环境变量是否缺失

### doctor
输出：

- human-readable 报告
- machine-readable JSON

至少检查：

- repo contract 完整性
- codegraph CLI 与 `.codegraph/`
- Context7 wrapper 可执行性
- active change 是否存在
- 运行时缺失项

### sync
负责仓库 contract 变更后，本地 runtime 的同步与迁移。

当前阶段至少提供：

- 读取 manifest
- 检查 bootstrap marker
- 检查 local adapter 示例
- 检查关键环境变量是否缺失
- 输出下一步接入建议

### hook adapter
repo 只声明要检查什么；本地 runtime 决定在当前 OS 上如何执行。

## 设计原则

- repo contract 不得依赖 Linux 路径约定
- 本地 secrets 不得进入仓库
- runtime 首选跨平台实现（例如 Node.js），而不是继续扩 bash-only 脚本
- contract 和 runtime 分离，但输出语义保持一致

## 当前阶段策略

- 保留现有 `hooks/*.sh` 与 `harness/bin/*.sh` 作为过渡实现
- 新增 `harness/plugin/runtime/*.mjs` 作为未来跨平台入口
- doctor 先做最小检查，不一次性替代全部 shell 脚本
