# Containerization / Sandboxing 指南

## 目标

给 Enterprise Harness 提供一个稳定、repo-facing 的容器化/沙箱化说明，明确：

- 哪些东西应该留在宿主机
- 哪些东西可以进入隔离环境
- local adapter、secrets、governed writes 在容器化场景中怎么处理

本指南参考了 pi 对 runtime isolation 的文档化方式，但不复制其具体实现。

## 基本原则

### 1. 默认运行模型
当前 Enterprise Harness 默认以本机进程运行：

- 规则与 hooks 在当前机器上执行
- runtime CLI 在当前机器上执行
- local adapter 也绑定当前机器环境

### 2. 容器化不是默认要求
当前仓库不把容器化视为接入前置条件。

它适用于：

- 更严格的权限边界
- 更可重复的本地接入环境
- 团队希望把 agent 写入面限制到受控目录

### 3. secrets 默认留在宿主机或 machine-local adapter
不要把真实 secrets 提交进仓库。

即使使用容器，也应优先通过：

- 环境变量
- machine-local adapter
- 宿主机挂载的安全配置路径

来注入，而不是写死进镜像或 repo。

## 三种推荐模式

### 模式 A：宿主机运行 + 容器只承载项目目录
适用于：

- 你想继续在宿主机使用 Claude Code / runtime
- 但希望把某些命令或工作目录放进容器里跑

特点：

- `AGENTS.md` / `CLAUDE.md` / `.claude/` 仍在宿主机 repo 中
- local adapter 仍以宿主机为主
- 容器主要提供更一致的命令执行环境

### 模式 B：整个 runtime 在容器中运行
适用于：

- 想做更可重复的新机器接入
- 希望 `bootstrap` / `doctor` / `sync` / `verify` 都在隔离环境里执行

特点：

- 需要把项目目录挂载到容器中
- 需要明确 local adapter 在容器中的路径
- provider/API 密钥会进入容器环境，因此要谨慎管理

### 模式 C：外层进程在宿主机，工具执行路由到沙箱
适用于：

- 需要更细粒度控制哪些写入/命令被隔离
- 想保留宿主机上的 agent 会话与认证上下文

特点：

- 宿主机负责总编排
- 沙箱/容器负责特定工具或写入路径
- 设计更复杂，但权限边界更清楚

## 与 local adapter 的关系

### 宿主机模式
优先使用当前默认 local adapter 路径：

- `HARNESS_LOCAL_ADAPTER`
- Windows：`%APPDATA%/enterprise-harness/local-adapter.json`
- Linux / macOS：`${XDG_CONFIG_HOME:-~/.config}/enterprise-harness/local-adapter.json`

### 容器模式
建议：

- 用单独的容器内 adapter 路径
- 或显式设置 `HARNESS_LOCAL_ADAPTER` 指向挂载卷中的配置文件

不要默认复用宿主机真实 `~/.config/enterprise-harness/` 路径，除非你明确接受容器对它的访问。

## 与 governed writes 的关系

当前受治理路径（如 `reference-service/`）仍由仓库内 hooks 和 runtime gate 控制。

容器化不会自动绕过这些约束。

如果你在容器里运行整个 runtime：

- `pre-write` / `post-write` / `stop` 仍会在容器里的 repo 上执行
- 但它们看到的是容器内的文件系统与环境变量

因此要特别注意：

- `harness/ACTIVE_CHANGE` 是否在容器里可见
- local adapter 是否指向正确路径
- 宿主机与容器之间的 repo 挂载是否一致

## 最小容器化建议

如果你只是想做最小实验，建议从：

1. 在容器中挂载 repo
2. 单独设置一个容器专用 `HARNESS_LOCAL_ADAPTER`
3. 跑下面几条命令开始：

```bash
node harness/plugin/runtime/cli.mjs bootstrap
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/cli.mjs sync
node harness/plugin/runtime/cli.mjs verify
```

## 当前边界

当前仓库**已提供指导**，但**未提供完整容器编排实现**。这意味着：

- 现在可以写清楚模式和边界
- 但不应宣称“已经有正式容器产品化方案”

## 结论

一句话总结：

> Enterprise Harness 当前默认运行在本机；容器化/沙箱化是增强型部署模式，重点是隔离写入面和运行时环境，而不是替代 repo contract、local adapter 或 hooks/gates 本身。
