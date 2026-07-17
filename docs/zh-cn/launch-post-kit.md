# Enterprise Harness 正式发布帖素材包

> **普通用户 30 秒开始：**
> 1. 安装 `enterprise-harness`
> 2. 打开 Claude Code
> 3. 输入 `/harness`
>
> 这就是普通用户路径；其余 runtime / maintainer 内容都不是普通用户前门。

> 这份文档是**发布 / 宣传素材包**，不是普通用户安装与上手说明。
>
> 普通用户请直接看：
>
> - [`installation-guide.md`](./installation-guide.md)
>
> 普通用户只需要记住：**安装插件，然后从 `/harness` 开始。**

## 使用说明

这份文档不是单一公告，而是一套可复用的发布素材。

你可以按渠道直接拷贝、微调：

- GitHub 仓库简介
- GitHub Release / 仓库公告
- 微信群 / 飞书群 / 内部群
- X / Twitter
- 掘金
- 即刻
- 知乎回答 / 专栏

统一口径：

> **Enterprise Harness = 围绕 Claude Code 的企业后端交付骨架**
>
> 当前状态：**可运行的 repo contract + portable runtime MVP**
>
> 普通用户入口：**安装插件后直接从 `/harness` 开始**

---

## 1. 最短版（适合 GitHub About / 仓库描述）

### 中文版

围绕 Claude Code 的企业后端交付骨架：把需求 intake、codegraph-first 探索、Context7-first 文档检索、design / TDD / review / validation、change 资产与 portable runtime / maintainer layer 收敛成一套可落盘、可验证、可跨机器接入的工程流程。

普通用户使用方式：**安装插件后直接从 `/harness` 开始。**

### 英文版

An enterprise backend delivery harness for Claude Code: turning intake, codegraph-first exploration, Context7-first docs lookup, design/TDD/review/validation, change artifacts, and a portable runtime / maintainer layer into a durable, verifiable, cross-machine workflow.

For end users, the entrypoint is simply: **install the plugin, then start from `/harness`**.

---

## 2. GitHub 仓库公告版（标准长文）

我们整理出了 **Enterprise Harness** 的第一版骨架。

这个项目围绕 **Claude Code + Java / Spring Boot 后端交付** 场景，不是为了证明“模型会写代码”，而是想把一次需求从输入到落地，推进成一套更接近企业团队协作的工程过程。

在这套骨架里：

- 项目共享约定通过 `CLAUDE.md`、`.claude/rules/`、`.claude/agents/`、`harness/specs/`、`harness/templates/` 定义
- 每次变更可以沉淀到 `harness/changes/`，而不是只留在聊天上下文里
- 代码探索默认走 **codegraph-first**
- 外部库与框架文档默认走 **Context7-first**
- 本地运行方式统一到 portable runtime / maintainer layer
- 对受治理路径的修改，开始接入 `active change`、`designApproved`、`redVerified`、stale validation 等最小 gate
- 对普通用户，唯一工作流前门是 `/harness`

如果你要向普通用户解释怎么开始，只需要两步：

1. 安装插件
2. 从 `/harness` 开始

---

## 3. 发布帖标准版（适合朋友圈 / 微信群 / 飞书群 / Telegram）

最近把一个想法整理成了第一版公开骨架：**Enterprise Harness**。

它的目标不是“让 Claude Code 更会写代码”，而是让 Claude Code 更像能进入团队工程流程的交付工具。

对普通用户，入口已经尽量收口成：

> **安装插件，然后从 `/harness` 开始。**

更底层的 runtime / maintainer layer、change 资产、hook gate、codegraph-first / Context7-first 等机制则留给仓库治理与维护层。

---

## 4. X / Twitter 版本

### 版本 A（简洁）

I open-sourced the first MVP of **Enterprise Harness** — a repo contract + portable runtime skeleton around Claude Code for enterprise-style backend delivery.

For end users, the path is simple:
**install the plugin, then start from `/harness`**.

### 版本 B（更解释型）

Most “AI coding workflows” stop at prompts.

**Enterprise Harness** tries to go one layer deeper with shared repo contract, machine-local runtime / maintainer layer, change artifacts in-repo, codegraph-first exploration, and Context7-first docs lookup.

For regular users, the front door is still just:
**install, then start from `/harness`**.

---

## 5. 掘金版

# 我做了一个围绕 Claude Code 的企业后端交付骨架：Enterprise Harness

很多人讨论 Claude Code，讨论的是“能不能写代码”。

但如果把场景放到团队协作里，真正的问题往往不是“能不能写”，而是：

- 需求怎么 intake？
- 项目规则怎么真正进运行时？
- 探索证据、变更状态、验证结果怎么落盘？
- 换一台机器之后，为什么同样的仓库就跑不起来了？
- 怎么避免所有东西都只停留在会话上下文里？

我最近把这类想法整理成了一个公开骨架项目：**Enterprise Harness**。

但对普通用户，它尽量不要求先理解这么多东西；普通用户只需要：

1. 安装插件
2. 从 `/harness` 开始

更底层的 runtime / maintainer layer、change 资产、hook gate 和 reviewer 机制则留给维护层与工程治理层。

---

## 6. 即刻版

最近把一个想法整理成公开骨架了：**Enterprise Harness**。

它不是让 Claude Code “更像聊天助手”，而是想让它更像能进入团队工程流程的东西。

但对普通用户，入口已经尽量收口得很简单：

> **安装插件后直接从 `/harness` 开始。**

---

## 7. 文档入口

- [项目概览](./overview.md)
- [安装教程](./installation-guide.md)
- [维护 / 排障指南](./maintainer-runtime-guide.md)
- `README.md`
