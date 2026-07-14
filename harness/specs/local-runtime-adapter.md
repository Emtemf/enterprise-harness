# Local Runtime Adapter 规范

## 目标

定义每台机器需要自己提供、但不能提交进仓库的那部分运行时适配信息。

## 原则

- 本地 adapter 解决 OS、shell、路径、工具安装与 secrets 差异
- 本地 adapter 不得进入 Git
- repo contract 只声明需要什么，不携带真实 secrets

## 本地 adapter 应覆盖的内容

### 1. 路径与命令
- `node` 路径
- `codegraph` 命令是否在 PATH 中
- `ctx7` / `npx` 是否可用
- Windows / macOS / Linux 的 shell 差异

### 2. 本地 secrets / env vars
- `CONTEXT7_API_KEY` 等本地密钥
- 任何 MCP / SDK 认证信息
- 本地 profile / token / OAuth 会话

### 3. 本地审批状态
- 某些 MCP 在本机是否已批准
- 哪些工具需要额外用户交互

### 4. 本地性能或偏好
- 是否允许自动初始化 `.codegraph/`
- 是否默认允许 Context7 CLI 网络查询
- 是否保留本地 log artifacts

## 与 repo contract 的边界

repo contract 负责：
- 规则
- 资产结构
- 模板
- 共享命令语义

local runtime adapter 负责：
- 这台机器怎么把共享语义跑起来
- 缺什么、怎么补
- 哪些命令在本机可执行

## 当前阶段建议

- 用 `harness/plugin/runtime/local-adapter.example.json` 作为示例
- 默认本机路径解析规则：
  - 若设置 `HARNESS_LOCAL_ADAPTER`，优先使用该路径
  - Windows：`%APPDATA%/enterprise-harness/local-adapter.json`
  - Linux / macOS：`${XDG_CONFIG_HOME:-~/.config}/enterprise-harness/local-adapter.json`
- 用 `setup-local-adapter.mjs` 负责 dry-run / 写入本机 adapter
- 用 `doctor.mjs` 暴露当前机器缺口
- 用 `sync.mjs` 给出本机接入与同步建议
