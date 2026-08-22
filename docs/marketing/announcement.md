# Enterprise Harness 项目公告文案（营销历史）

> **普通用户 30 秒开始：**
> 1. 安装 `enterprise-harness`
> 2. 打开 Claude Code
> 3. 输入 `/enterprise-harness:harness`
>
> 这就是普通用户路径；其余 runtime / maintainer 内容都不是普通用户前门。

> 这份文档是**对外公告 / 发布文案素材**，不是普通用户上手指南。
>
> 普通用户请直接看：
>
> - [`quickstart.md`](../user/quickstart.md)
>
> 普通用户只需要记住：**安装插件，然后从 `/enterprise-harness:harness` 开始。**

本文提供三种可直接使用的对外文案：

1. 短版介绍
2. 标准公告版
3. 社区/社交平台版

---

## 1. 短版介绍

**Enterprise Harness** 是一套围绕 **Claude Code** 的企业后端交付骨架。

它不是单纯让模型“会写代码”，而是把需求 intake、代码探索、文档检索、设计、TDD、评审、验证和归档，收敛成一套**可落盘、可恢复、可验证、可跨机器接入**的工程流程。

当前版本已经具备：

- repo contract
- Claude Code-only phase 1 的 staged workflow / skills / agents / hooks 接缝层
- change 生命周期骨架
- 基于 hooks 的最小治理门禁
- CodeGraph / Context7 接入策略
- Linux / macOS / Windows 平台 smoke matrix

当前最准确的状态是：

> **可运行的 repo contract + Claude Code-only phase 1 staged workflow 基线**

同时，对普通用户的使用入口已经收口为：

> **安装插件，然后从 `/enterprise-harness:harness` 开始。**

---

## 2. 标准公告版

我们开源了 **Enterprise Harness** 的第一版骨架。

这个项目面向 **Claude Code + Java/Spring Boot 后端交付** 场景，目标不是做一个“会聊天的写代码工具”，而是把一次需求从输入到落地，推进成一套更接近企业团队协作的工程过程。

在这套骨架里：

- 项目共享约定由 `CLAUDE.md`、根目录 `skills/`、`agents/`、`hooks/`、`harness/specs/`、`harness/templates/` 共同定义
- 每台机器通过 Claude Code-only phase 1 的动作层 / maintainer layer 自己适配本地路径、工具、shell、环境变量和 secrets
- 代码探索默认走 **codegraph-first**
- 外部库与框架文档默认走 **Context7-first**
- change 会沉淀到 `harness/changes/`，而不是只留在聊天上下文里
- 对受治理路径的修改，已经开始接入 `designApproved`、`redVerified`、stale validation 等运行时 gate
- 对 plugin 用户，唯一工作流前门已经收口为 `/enterprise-harness:harness`

这个仓库当前已经具备：

- 统一的 `/enterprise-harness:harness` plugin 用户入口
- 动作层 / maintainer layer
- local adapter schema 与示例
- Node 版 hook adapters
- 本地发布前完整质量门禁，以及按需手动触发的 Linux / macOS / Windows smoke matrix

如果你想对外介绍普通用户怎么用，建议只说：

1. 安装 `enterprise-harness`
2. 进入 Claude Code 会话
3. 直接从 `/enterprise-harness:harness` 开始

---

## 3. 社区 / 社交平台版

### 版本 A

我们刚把 **Enterprise Harness** 的第一版骨架整理出来。

它面向 Claude Code + Java 后端交付，不只是“让模型写代码”，而是把：

- intake
- codegraph-first 探索
- context7-first 文档检索
- design / TDD / review / validation
- change 资产落盘
- 本地 动作层 / maintainer layer

收敛成一套可协作、可恢复、可跨机器接入的工程骨架。

当前状态：

> 可运行的 repo contract + Claude Code-only phase 1 staged workflow 基线

普通用户入口则收口为：

> **安装插件，然后从 `/enterprise-harness:harness` 开始。**

### 版本 B

如果你也在想：

> Claude Code 能不能不是“聊天 + 临时上下文”，而是真进入团队工程流程？

我们做了一个叫 **Enterprise Harness** 的骨架项目。

它把仓库共享契约和机器本地运行层拆开，让 codegraph、Context7、change 资产、hook gate 和 动作层 / maintainer layer 能放进同一个工作流里。

对普通用户，入口已经收口成：**安装后直接从 `/enterprise-harness:harness` 开始**。

---

## 4. 对外介绍时建议坚持的口径

### 建议这样说

- “这是围绕 Claude Code 的企业后端交付骨架”
- “当前状态是可运行的 repo contract + Claude Code-only phase 1 staged workflow 基线”
- “普通用户安装后直接从 `/enterprise-harness:harness` 开始”
- “支持按需委托子 agent 做只读分析、规划与评审，但不把并行改代码当默认模式”
- “项目高层约定保留在 `CLAUDE.md`，探索证据和 change 事实沉淀到 `harness/` 资产”

### 不建议这样说

- “已经一键安装稳定可用”
- “所有门禁都 fully automated”

---

## 5. 配套文档入口

- [项目概览](../../README.md)
- [安装教程](../user/quickstart.md)
- [维护 / 排障指南](../maintainer/runtime-operations.md)
- `README.md`
- `CLAUDE.md`
- `harness/specs/distribution-and-release.md`
