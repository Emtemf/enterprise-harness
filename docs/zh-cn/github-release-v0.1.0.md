# Enterprise Harness v0.1.0

## Release Summary

这是 **Enterprise Harness** 的第一版公开 MVP。

它围绕 **Claude Code** 构建，目标不是单纯展示“模型会写代码”，而是把一次需求从输入到落地，推进成一套更接近企业后端团队协作的工程过程：

- 可探索
- 可落盘
- 可审查
- 可验证
- 可恢复
- 可跨机器接入

当前最准确的状态表述是：

> **可运行的 repo contract + portable runtime MVP**

这意味着它已经是一个真实可运行、可继续演进的第一版骨架；但还不是完整企业级强门禁平台，也不是已经 fully productized 的公开安装成品插件。

---

## What’s Included in v0.1.0

### 1. Repo Contract Skeleton

当前仓库已经具备一套可共享的项目契约层：

- `CLAUDE.md`
- `.claude/rules/`
- `.claude/agents/`
- `.claude/skills/`
- `harness/specs/`
- `harness/templates/`
- `harness/changes/`
- `harness/config.yaml`

这部分负责定义：

- 工作流
- 规则
- change 生命周期
- reviewer 角色
- 资产结构
- 证据与归档落点

### 2. Portable Runtime CLI

当前已具备统一 Node CLI 入口：

```bash
node harness/plugin/runtime/cli.mjs <command>
```

包括：

- `bootstrap`
- `doctor`
- `sync`
- `verify`
- `install`
- `setup-local-adapter`
- `update`
- `upgrade`
- `migrate`
- `upstream-check`
- `lifecycle`
- `context7`

### 3. Local Runtime Adapter Model

当前版本已包含：

- `local-adapter.schema.json`
- `local-adapter.example.json`
- `setup-local-adapter.mjs`
- `migrate.mjs`

用于把：

- 本地路径
- 工具命令
- shell / OS 差异
- 环境变量
- 本机审批与网络条件

从 repo contract 中拆分出来。

### 4. Runtime Hook Adapters

当前 `.claude/settings.json` 已接上：

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `Stop`

当前重点能力包括：

- 启动时检查 `.claude/` 与 `harness/` 骨架
- 写入前检查受治理路径所需 gate
- 写入后执行结构与轻语义检查
- 会话结束前阻止 stale validation 或缺少 `validation.md` 的“伪完成”状态

### 5. Request / Change Lifecycle Foundation

当前已具备最小 change 资产模型：

- `state.json`
- `change.md`
- `validation.md`
- `evidence/tooling.md`

并提供 `lifecycle` 命令支持：

- scaffold
- exploration
- active
- state
- impact
- review-verdict
- design-approved
- red-verified
- reviewed
- validated
- validation-stale

### 6. Exploration and Docs Lookup Strategy

当前默认策略：

- **codegraph-first**：代码探索主路径
- **Context7-first**：外部库/框架文档主路径

并且已经配套：

- fallback policy
- tooling evidence 落点
- upstream governance registry

### 7. Cross-Platform Smoke Matrix

GitHub Actions `platform-smoke` 当前已覆盖：

- Linux
- macOS
- Windows

当前可以准确表述为：

> Linux 已长期实测；macOS / Windows 的当前 runtime smoke 路径已在 CI matrix 验证通过。

---

## Quickstart

当前最推荐的接入方式仍是：**clone 仓库后在仓库根目录执行 runtime CLI**。

### Prerequisites

- Node.js >= 20
- 推荐安装 `codegraph`
- 推荐本机可用 `npx` / `ctx7`

### First-time setup

```bash
git clone <your-repo-url>
cd enterprise-harness

node harness/plugin/runtime/cli.mjs bootstrap
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/cli.mjs sync
node harness/plugin/runtime/cli.mjs verify
node harness/plugin/runtime/cli.mjs upstream-check
```

---

## What This Release Is Not

为了避免误解，这个版本**不应**被表述为：

- 完整企业级强门禁平台
- 已 fully productized 的公开安装插件
- 所有路径都已接入同等强度 gate 的系统
- 所有本机环境都零差异支持的成品

当前仍在后续迭代中的内容包括：

- 更完整的 plan gate / task gate
- 更细粒度的 `RED_VERIFIED` 消费逻辑
- ArchUnit
- JaCoCo 85% 机械门禁
- 真实 HTTP API E2E
- 更强 OpenAPI 语义门禁
- 更完整 installer / upgrade / migration 体验
- 更广泛真机开发机场景验证

---

## Suggested Audience

这个版本更适合：

- 想把 Claude Code 用进 **Java / Spring Boot 后端团队流程**的人
- 想让 AI coding 从“会话技巧”进入“项目契约 + runtime + change 资产”的团队
- 想基于现有骨架继续做企业化扩展的人

这个版本暂时不适合作为：

- 希望直接获得一个“开箱即用、零配置安装”的最终产品的人
- 希望用它完整替代企业 CI/CD 与质量平台的人

---

## Documentation

### First read
- `README.md`
- `docs/zh-cn/overview.md`
- `docs/zh-cn/installation-guide.md`
- `docs/zh-cn/announcement.md`
- `docs/zh-cn/launch-post-kit.md`

### Core specs
- `CLAUDE.md`
- `harness/specs/plugin-runtime.md`
- `harness/specs/local-runtime-adapter.md`
- `harness/specs/platform-validation-matrix.md`
- `harness/specs/release-readiness.md`
- `harness/specs/mvp-roadmap.md`

---

## Verification Notes

当前这版文档整理后，runtime 最小自检可通过：

```bash
node harness/plugin/runtime/cli.mjs verify
```

并返回：

```text
Enterprise Harness Verify
OK contract and runtime checks passed.
```

---

## Closing

**Enterprise Harness v0.1.0** 更像是一个公开、真实可运行、可继续产品化的第一版骨架。

如果你关心的不是“Claude Code 会不会写代码”，而是：

> Claude Code 怎么进入团队工程流程？

那么这个版本就是围绕这个问题给出的第一版回答。
