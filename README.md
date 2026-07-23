# Enterprise Harness

一套围绕 Claude Code 的**工程治理骨架**——用 prompt 约束 + 机械门禁 + durable 状态，让 AI 在团队协作中走得更稳，而不是更自由。

> 它不是一个完整的交付平台，而是一个帮你给 Claude Code 上规矩的基础设施。

## 它是什么

装上这个插件后，你得到三层东西：

**1. 一套工作流 prompt（模型自觉层）**

`/harness` 命令会引导 Claude 按澄清→设计→计划→TDD→验证的流程推进需求。这些是 SKILL.md 里的文字指令，Claude 会尝试遵守，但本质上是"建议"而非"强制"。

**2. 几个真正有效的机械门禁（程序拦截层）**

当 Claude 尝试写入受治理路径（`src/main/java`、`src/test/java`、`openapi/`）时：
- `pre-write.mjs` 会检查 `state.json`，缺少 `designApproved` 或 RED 证据时直接报错
- `post-write.mjs` 会检查变更资产完整性
- `stop.mjs` 会阻止带着过期验证数据"假装完成"

这些是**跑在你机器上的 Node.js 程序**，不依赖模型自觉。

**3. 状态管理（打断后可恢复）**

每个 change 都有 `state.json` + `validation.md` + reviewer verdict。即使 Claude 会话中断，下次恢复时能看到之前做到哪一步、差什么。

## 安装

### 方式 A：Claude Code 会话里（推荐）

```
/plugin marketplace add https://github.com/Emtemf/enterprise-harness
/plugin install enterprise-harness@enterprise-harness
```

### 方式 B：终端

```bash
claude plugin marketplace add https://github.com/Emtemf/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

### 方式 C：手动安装（离线/代理/TLS 不稳）

从 [Releases](https://github.com/Emtemf/enterprise-harness/releases) 下载 tarball：

```bash
tar -xzf enterprise-harness-*.tar.gz -C /tmp/eh
cd /tmp/eh
node bin/install.mjs --target /path/to/your/project
```

## 使用

安装后唯一入口：`/harness`。

在任意项目里输入 `/harness`，Claude 会先澄清需求，再走流程。改代码时门禁自动生效。

## 诚实边界

### 什么是真正强制的

- 受治理路径（`src/main/java`、`src/test/java`、`openapi/`）的写入前检查
- 变更资产完整性检查
- 验证新鲜度检查

### 什么是"建议遵守"的

- 一次只问一个问题
- 先澄清再动手
- reviewer block 时不进入下一阶段
- TDD 严格 RED→GREEN→REFACTOR

这些是 SKILL.md 和 `.claude/rules/` 里的文字指令。Claude 强模型通常会遵守，弱模型可能跳过。

### 什么还没实现

- 通用 OpenAPI ↔ Controller 交叉校验器（当前只做结构检查）
- ArchUnit 架构门禁
- JaCoCo 覆盖率机械检查
- 真实 HTTP API E2E

## 适合谁 / 不适合谁

**适合**：
- Java 后端团队，想让 AI 在有约束的流程下工作
- 需要 durable 状态和可追溯变更记录的团队
- 弱模型场景，需要额外约束兜底

**不适合**：
- 只想做快速原型、不想走流程
- 前端为主
- 期待"一问就出代码"的体验

## 设计理念

这个项目借鉴了五个参考实现：
- **分阶段 SOP** ← Superpowers
- **归档与资产分层** ← OpenSpec
- **苏格拉底式澄清** ← deep-interview
- **打断后可继续** ← gump（durable state）
- **角色视角** ← role-workbench

目标是让较弱的模型在明确约束下也能稳定工作——但约束本身也有边界，不是万能的。

## 维护者命令

```bash
node harness/plugin/runtime/cli.mjs doctor     # 环境体检
node harness/plugin/runtime/cli.mjs verify     # 契约检查
node harness/plugin/runtime/cli.mjs status     # 当前状态
```

## 深入阅读

- `PROGRESS.md` — 当前进度
- `CLAUDE.md` — 项目约束
- `AGENTS.md` — 仓库协作合同
- `harness/specs/staged-workflow.md` — 分阶段工作流规范

## License

Apache-2.0
