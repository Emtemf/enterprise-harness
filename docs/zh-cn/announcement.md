# Enterprise Harness 项目公告文案（中文）

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
- portable runtime CLI
- change 生命周期骨架
- 基于 hooks 的最小治理门禁
- CodeGraph / Context7 接入策略
- Linux / macOS / Windows 平台 smoke matrix

当前最准确的状态是：

> **可运行的 repo contract + portable runtime MVP**

---

## 2. 标准公告版

我们开源了 **Enterprise Harness** 的第一版骨架。

这个项目面向 **Claude Code + Java/Spring Boot 后端交付** 场景，目标不是做一个“会聊天的写代码工具”，而是把一次需求从输入到落地，推进成一套更接近企业团队协作的工程过程。

在这套骨架里：

- 项目共享约定由 `CLAUDE.md`、`.claude/rules/`、`.claude/agents/`、`harness/specs/`、`harness/templates/` 共同定义
- 每台机器通过 portable runtime 自己适配本地路径、工具、shell、环境变量和 secrets
- 代码探索默认走 **codegraph-first**
- 外部库与框架文档默认走 **Context7-first**
- change 会沉淀到 `harness/changes/`，而不是只留在聊天上下文里
- 对受治理路径的修改，已经开始接入 `designApproved`、`redVerified`、stale validation 等运行时 gate

这个仓库当前已经具备：

- 统一 runtime CLI
- `bootstrap` / `doctor` / `sync` / `verify`
- `install` / `setup-local-adapter` / `upgrade` / `migrate` skeleton
- local adapter schema 与示例
- Node 版 hook adapters
- GitHub Actions 下的 Linux / macOS / Windows smoke matrix

同时我们也明确当前边界：

- 这还不是完整企业级强门禁平台
- ArchUnit、JaCoCo 85%、真实 HTTP API E2E、完整 OpenAPI 语义校验仍在后续迭代中
- 当前更适合被理解为一个**真实可运行、可继续产品化的第一版骨架**

如果你想要的不是“又一个 prompt 集合”，而是一套围绕 Claude Code 的**项目契约、运行时、自检、变更资产和工作流骨架**，那么这个项目会更接近你想找的方向。

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
- 本地 runtime 适配

收敛成一套可协作、可恢复、可跨机器接入的工程骨架。

当前状态：

> 可运行的 repo contract + portable runtime MVP

已经有统一 CLI、hook gate、change lifecycle 和 Linux/macOS/Windows smoke matrix。

### 版本 B

如果你也在想：

> Claude Code 能不能不是“聊天 + 临时上下文”，而是真进入团队工程流程？

我们做了一个叫 **Enterprise Harness** 的骨架项目。

它把仓库共享契约和机器本地运行层拆开，让 codegraph、Context7、change 资产、hook gate 和 runtime CLI 能放进同一个工作流里。

当前已经是一个可运行的 MVP，不是最终平台，但关键路径已经跑通。

---

## 4. 对外介绍时建议坚持的口径

### 建议这样说

- “这是围绕 Claude Code 的企业后端交付骨架”
- “当前状态是可运行的 repo contract + portable runtime MVP”
- “支持按需委托子 agent 做只读分析、规划与评审，但不把并行改代码当默认模式”
- “项目高层约定保留在 `CLAUDE.md`，探索证据和 change 事实沉淀到 `harness/` 资产”
- “平台矩阵 smoke 已在 GitHub Actions 跑通，但更广泛的真机开发机场景仍在补”

### 不建议这样说

- “已经是完整企业平台”
- “已经一键安装稳定可用”
- “所有门禁都 fully automated”
- “所有平台、所有本机环境都已经正式支持”

---

## 5. 配套文档入口

- [项目概览](./overview.md)
- [安装教程](./installation-guide.md)
- `README.md`
- `CLAUDE.md`
- `harness/specs/release-readiness.md`
