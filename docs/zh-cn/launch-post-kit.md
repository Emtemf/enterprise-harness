# Enterprise Harness 正式发布帖素材包

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

---

## 1. 最短版（适合 GitHub About / 仓库描述）

### 中文版

围绕 Claude Code 的企业后端交付骨架：把需求 intake、codegraph-first 探索、Context7-first 文档检索、design / TDD / review / validation、change 资产与 portable runtime 收敛成一套可落盘、可验证、可跨机器接入的工程流程。

### 英文版

An enterprise backend delivery harness for Claude Code: turning intake, codegraph-first exploration, Context7-first docs lookup, design/TDD/review/validation, change artifacts, and portable runtime into a durable, verifiable, cross-machine workflow.

---

## 2. GitHub 仓库公告版（标准长文）

我们整理出了 **Enterprise Harness** 的第一版骨架。

这个项目围绕 **Claude Code + Java / Spring Boot 后端交付** 场景，不是为了证明“模型会写代码”，而是想把一次需求从输入到落地，推进成一套更接近企业团队协作的工程过程。

在这套骨架里：

- 项目共享约定通过 `CLAUDE.md`、`.claude/rules/`、`.claude/agents/`、`harness/specs/`、`harness/templates/` 定义
- 每次变更可以沉淀到 `harness/changes/`，而不是只留在聊天上下文里
- 代码探索默认走 **codegraph-first**
- 外部库与框架文档默认走 **Context7-first**
- 本地运行方式统一到 portable runtime CLI
- 对受治理路径的修改，开始接入 `active change`、`designApproved`、`redVerified`、stale validation 等最小 gate

当前版本已经具备：

- repo contract
- portable runtime CLI
- bootstrap / doctor / sync / verify / upstream-check
- local adapter schema 与 setup
- Node 版 hook adapters
- change 生命周期骨架
- Linux / macOS / Windows 平台 smoke matrix

同时我们也明确它的当前边界：

- 这还不是完整企业级强门禁平台
- ArchUnit、JaCoCo 85%、真实 HTTP API E2E、完整 OpenAPI 语义门禁仍在后续迭代中
- 更广泛的真机开发机场景验证也仍在继续补齐

所以当前最准确的表述是：

> **Enterprise Harness 现在是一个可运行的 repo contract + portable runtime MVP。**

如果你也在找的不是“又一个 prompt 集合”，而是一套能把 Claude Code 纳入项目契约、运行时、自检、变更资产和工程工作流的骨架，那么这个项目可能会对你有帮助。

文档入口：

- `README.md`
- `docs/zh-cn/overview.md`
- `docs/zh-cn/installation-guide.md`
- `docs/zh-cn/announcement.md`

---

## 3. 发布帖标准版（适合朋友圈 / 微信群 / 飞书群 / Telegram）

最近把一个想法整理成了第一版公开骨架：**Enterprise Harness**。

它的目标不是“让 Claude Code 更会写代码”，而是让 Claude Code 更像能进入团队工程流程的交付工具。

这套骨架主要做了几件事：

- 把项目共享契约和机器本地运行层拆开
- 让代码探索走 codegraph-first
- 让外部文档查询走 Context7-first
- 让 change、validation、review verdict 这些东西落到仓库资产，而不是只存在会话里
- 用 runtime CLI + hook gate 把 design、RED、validation 这些约束逐步接进真实运行面

当前版本已经是：

> **可运行的 repo contract + portable runtime MVP**

已经有统一 CLI、change lifecycle、Node hook adapters，以及 Linux / macOS / Windows 的 smoke matrix。

当然它还不是完整企业平台，像 ArchUnit、JaCoCo 85%、真实 HTTP API E2E、完整 OpenAPI 门禁这些还在后续迭代里。

但如果你关心的是：

> Claude Code 怎么从“聊天写代码”变成“可协作、可恢复、可验证的工程骨架”？

那这个项目应该会比较对路。

---

## 4. X / Twitter 版本

### 版本 A（简洁）

I open-sourced the first MVP of **Enterprise Harness** — a repo contract + portable runtime skeleton around Claude Code for enterprise-style backend delivery.

It focuses on:
- codegraph-first code exploration
- Context7-first docs lookup
- durable change artifacts
- runtime CLI + hook gates
- cross-machine onboarding

Current status:
**a runnable repo contract + portable runtime MVP**

### 版本 B（更解释型）

Most “AI coding workflows” stop at prompts.

**Enterprise Harness** tries to go one layer deeper:
- shared repo contract
- machine-local runtime adapter
- change artifacts in-repo
- codegraph-first exploration
- Context7-first docs lookup
- runtime gates for design / RED / validation

Built around Claude Code.
Current state: **runnable repo contract + portable runtime MVP**.

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

它的核心不是“让模型自由发挥”，而是把 Claude Code 接进一套更像工程系统的结构里：

## 这套骨架做了什么

### 1. 拆成两层

- **Repo Contract**：团队共享的规则、模板、spec、change 资产
- **Portable Runtime**：每台机器自己适配的本地运行层

### 2. 约定代码探索和文档检索主路径

- 代码探索：**codegraph-first**
- 外部库文档：**Context7-first**

### 3. 让 change 真正落进仓库

不是只在会话里说“我们现在在做什么”，而是通过：

- `harness/changes/`
- `state.json`
- `validation.md`
- `review verdict`
- `tooling evidence`

把过程和状态沉淀下来。

### 4. 用 runtime CLI 和 hook gate 接真实运行面

当前已经有：

- `bootstrap`
- `doctor`
- `sync`
- `verify`
- `upstream-check`
- local adapter setup
- Node hook adapters

对 `reference-service/` 的受治理路径，也已经开始接入：

- active change
- designApproved
- redVerified
- stale validation

## 当前做到什么程度

我不会把它吹成“完整企业平台”。

更准确的说法是：

> **它现在是一个可运行的 repo contract + portable runtime MVP。**

已经具备：

- 统一 runtime CLI
- 最小 change lifecycle
- 最小 gate
- Linux / macOS / Windows 平台 smoke matrix

但以下内容还在后续迭代里：

- ArchUnit
- JaCoCo 85%
- 真实 HTTP API E2E
- 更强 OpenAPI 语义门禁
- 更广泛真机开发机场景验证

## 适合谁

如果你关心的是：

> 怎么把 Claude Code 从“聊天写代码”推进成“带项目契约、运行时、自检和变更资产的工程骨架”？

那这个项目应该比较有参考价值。

---

## 6. 即刻版

最近把一个想法整理成公开骨架了：**Enterprise Harness**。

它不是让 Claude Code “更像聊天助手”，而是想让它更像能进入团队工程流程的东西。

重点是把：
- codegraph-first 探索
- Context7-first 文档检索
- change 资产落盘
- runtime CLI
- hook gate
- 跨机器本地 adapter

放到同一套结构里。

当前状态我只敢说：

> **可运行的 repo contract + portable runtime MVP**

不是完整企业平台，但关键路径已经跑通了，而且 Linux/macOS/Windows smoke matrix 也已经有了。

---

## 7. 知乎回答 / 专栏版开头

如果你问我：

> Claude Code 能不能真的进入企业团队开发流程？

我的答案是：能，但前提不是“多写几个 prompt”，而是你得把它放进一套有**共享契约、变更状态、运行时入口、本机适配、验证证据和最小门禁**的结构里。

我最近整理出的 **Enterprise Harness**，就是在做这件事。

它当前不是终态平台，而是一个第一版骨架：

> **可运行的 repo contract + portable runtime MVP**

这个项目的重点不是让模型“更自由”，而是让工程过程“更有边界、更能恢复、更可验证”。

---

## 8. 常用结尾句

### 结尾 A
如果你也在探索 Claude Code 怎么进入团队工程流程，而不是停留在单次会话层，这个项目应该会有参考价值。

### 结尾 B
欢迎把它当成一个公开骨架来看，而不是一个已经 fully productized 的终态平台。

### 结尾 C
如果你也关心 codegraph-first、change 资产、runtime gate、portable runtime 这些方向，欢迎交流。

---

## 9. 对外 FAQ 短答

### Q1：这是一个 Claude Code 插件吗？
更准确地说，它当前是**围绕 Claude Code 的 repo contract + portable runtime 骨架**，而不是已经完成公开分发的一键安装插件产品。

### Q2：它已经正式支持全平台了吗？
当前可以说：Linux / macOS / Windows 的 runtime smoke matrix 已在 CI 跑通；更广泛的真机开发机场景仍在继续验证。

### Q3：这是 Java 项目模板吗？
不只是。它有一个 `reference-service/` 作为 Java 演示样板，但核心目标是围绕 Claude Code 的工程工作流与运行时骨架。

### Q4：它和 prompt 工程有什么区别？
它更关注：
- 项目契约
- change 生命周期
- 探索与文档查询主路径
- 本地 runtime
- hook gate
- validation 证据

而不是只停留在“怎么写提示词”。

---

## 10. 推荐配套链接

建议发帖时一起带：

- `README.md`
- `docs/zh-cn/overview.md`
- `docs/zh-cn/installation-guide.md`
- `docs/zh-cn/announcement.md`
