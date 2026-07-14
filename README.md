# Enterprise Harness MVP

一个面向 **Claude Code** 的企业后端交付骨架项目。目标不是演示“模型会写代码”，而是把需求分流、代码探索、文档检索、设计、计划、TDD、验证、归档和本地运行时适配，变成一套**可落盘、可验证、可跨机器接入**的工程骨架。

> 当前状态：**可运行的 repo contract + portable runtime MVP**
>
> 它已经足够作为团队共享、跨会话可恢复、跨机器可接入的第一版骨架；但还不是完整企业级强门禁平台。

---

## 1. 这个项目是什么

它是一套围绕 Claude Code 的本地企业 Harness，分成两层：

### A. Repo Contract（仓库共享契约）
提交到仓库，由团队共享：

- 根 `CLAUDE.md`：短地图与操作合同
- `.claude/rules/`：项目自动加载规则
- `.claude/agents/`：项目 reviewer / subagent 骨架
- `.claude/skills/`：项目级 skill（当前有 `harness-intake`）
- `harness/specs/`：长期稳定规范
- `harness/templates/`：通用模板
- `harness/config.yaml`：项目能力声明
- `.mcp.json`：项目级 MCP 声明（只放无密配置）

### B. Portable Runtime（跨平台运行层）
每台机器自己适配：

- `harness/plugin/manifest.json`
- `harness/plugin/runtime/cli.mjs`（统一入口）
- `harness/plugin/runtime/bootstrap.mjs`
- `harness/plugin/runtime/doctor.mjs`
- `harness/plugin/runtime/sync.mjs`
- `harness/plugin/runtime/install.mjs`
- `harness/plugin/runtime/setup-local-adapter.mjs`
- `harness/plugin/runtime/upgrade.mjs`
- `harness/plugin/runtime/migrate.mjs`
- `harness/plugin/runtime/local-adapter.schema.json`
- `harness/plugin/runtime/local-adapter.example.json`
- `harness/plugin/runtime/hooks/*.mjs`

这两层分开后，项目就不再只是“当前 Linux 会话里能跑的一堆脚本”，而是开始具备**换机器、换系统也能接入**的插件骨架。

---

## 2. 当前已经真实可用的能力

### 2.1 代码探索
- **codegraph-first** 已真实可用
- 当前项目已经完成 `.codegraph/` 初始化
- `codegraph status` 能返回真实索引状态

### 2.2 外部文档检索
- **Context7 CLI wrapper** 已真实可用
- 当前默认入口：
  - `bash harness/bin/context7-library.sh <library-name> <query>`
  - `bash harness/bin/context7-docs.sh <library-id> <query>`
- 当前阶段不依赖待审批的 project MCP 作为主路径

### 2.3 变更生命周期命令
当前同时保留：

#### legacy shell commands
- `create-change-scaffold.sh`
- `create-exploration-artifact.sh`
- `update-change-state.sh`
- `set-active-change.sh`
- `show-active-change.sh`
- `set-change-impact.sh`
- `record-review-verdict.sh`
- `mark-change-reviewed.sh`
- `mark-change-validated.sh`

#### unified runtime entry
- `node harness/plugin/runtime/cli.mjs lifecycle ...`
- `node harness/plugin/runtime/cli.mjs context7 ...`

这两条入口都已经实际 smoke test 通过；长期方向是把安装者更多地引导到统一 runtime CLI。

### 2.4 写入门禁
- 通过 `harness/ACTIVE_CHANGE` 管控受治理路径写入
- 对 `reference-service/src/main` / `src/test` / `openapi` 的修改，必须有 active change
- 若 active change 仍是 `DRAFT`，Node runtime pre-write gate 会阻断写入
- 若未标记 `designApproved=true`，测试路径写入会被阻断
- 若未标记 `redVerified=true`，生产源码与 OpenAPI 路径写入会被阻断
- 若某个 change 已 `VALIDATED` 但 `validation.status=stale`，stop gate 会阻断结束

### 2.5 本地验证
当前最小验证面已经真实可运行：

- `bash hooks/validate-spec-structure.sh`
- `bash hooks/validate-openapi.sh`
- `bash hooks/validate-controller-consistency.sh`
- `bash hooks/full-verify.sh`

### 2.6 跨平台 runtime 自检与同步
当前推荐统一入口：

- `node harness/plugin/runtime/cli.mjs bootstrap`
- `node harness/plugin/runtime/cli.mjs doctor`
- `node harness/plugin/runtime/cli.mjs sync`
- `node harness/plugin/runtime/cli.mjs verify`
- `node harness/plugin/runtime/cli.mjs install --write-local-adapter`
- `node harness/plugin/runtime/cli.mjs setup-local-adapter --write`
- `node harness/plugin/runtime/cli.mjs update`
- `node harness/plugin/runtime/cli.mjs upgrade`
- `node harness/plugin/runtime/cli.mjs migrate`
- `node harness/plugin/runtime/cli.mjs upstream-check`
- `node harness/plugin/runtime/cli.mjs lifecycle <action> ...`
- `node harness/plugin/runtime/cli.mjs context7 <library|docs> ...`

第一次接入建议直接看：

- `harness/plugin/runtime/ONBOARDING.md`

其中：
- `doctor` 支持人类可读输出和 `--json`
- `sync` 支持人类可读输出和 `--json`
- install / setup / migrate / upgrade 已有可执行 skeleton
- upstream-check 已可运行，用于盘点 CodeGraph / Context7 / 参考型上游关系
- 当前都已真实跑通过

---

## 3. 当前目录结构

```text
.
├── CLAUDE.md
├── README.md
├── .mcp.json
├── .claude/
│   ├── settings.json
│   ├── rules/
│   ├── agents/
│   └── skills/
├── hooks/
├── harness/
│   ├── bin/
│   ├── changes/
│   ├── explorations/
│   ├── plugin/
│   ├── reviewers/
│   ├── specs/
│   ├── templates/
│   └── work/
├── reference-service/
├── rules/      # 历史参考，不再是运行时唯一真相
└── agents/     # 历史参考，不再是运行时唯一真相
```

### 关键目录说明

#### `.claude/rules/`
Claude Code 自动加载的项目规则源。当前已包括：

- `00-workflow.md`
- `10-code-analysis.md`
- `20-documentation.md`
- `30-java-architecture.md`
- `40-java-style.md`
- `50-testing.md`
- `60-api-contract.md`
- `70-review.md`

#### `.claude/agents/`
项目 reviewer 骨架：

- `requirement-reviewer`
- `design-reviewer`
- `plan-critic`
- `api-consistency-reviewer`
- `verification-reviewer`

#### `.claude/skills/harness-intake/`
企业 Java 后端需求入口。它的职责不是直接开写代码，而是：

- provisional triage
- minimum discovery
- codegraph-first / Context7-first
- Socratic clarification
- final route（L0/L1/L2/L3）
- 驱动最小 change 资产落盘

#### `harness/specs/`
长期稳定规范。当前已包括：

- `instruction-layering.md`
- `directory-model.md`
- `artifact-lifecycle.md`
- `requirement-intake.md`
- `tool-fallback-policy.md`
- `plugin-runtime.md`
- `local-runtime-adapter.md`
- `mvp-roadmap.md`

#### `harness/templates/`
通用模板：

- `state.json`
- `change.md`
- `spec.md`
- `design.md`
- `tasks.md`
- `validation.md`
- `review-verdict.json`
- `exploration.md`
- `tooling-evidence.md`

#### `harness/changes/`
活动 change 资产区。每个 change 默认至少有：

- `state.json`
- `change.md`
- `validation.md`
- `evidence/tooling.md`

#### `harness/plugin/runtime/`
跨平台运行层。当前已具备：

- `bootstrap.mjs`
- `doctor.mjs`
- `sync.mjs`
- `install.mjs`
- `setup-local-adapter.mjs`
- `local-adapter.example.json`
- `hooks/*.mjs`
- `lib/*.mjs`

#### `reference-service/`
一个可运行的 Java 后端参考服务，用于演示：

- 四层分层
- domain port / adapter 方向
- 最小 MapStruct 示例
- 最小 error contract
- BDD 命名 + `@DisplayName` + JavaDoc

它现在是**样板演示面**，不是整个插件的核心。

---

## 4. 如何使用这套骨架

## 4.1 先看 contract
阅读：

- `CLAUDE.md`
- `harness/specs/mvp-roadmap.md`
- `harness/specs/requirement-intake.md`
- `harness/specs/plugin-runtime.md`

## 4.2 检查本机运行层
当前推荐统一入口：

```bash
node harness/plugin/runtime/cli.mjs bootstrap
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/cli.mjs sync
```

如果你希望在本机生成一个 local adapter 示例文件：

```bash
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
```

默认本机 adapter 路径约定：

- 若设置了 `HARNESS_LOCAL_ADAPTER`：优先使用该路径
- Windows：`%APPDATA%/enterprise-harness/local-adapter.json`
- Linux / macOS：`${XDG_CONFIG_HOME:-~/.config}/enterprise-harness/local-adapter.json`

## 4.3 创建一个新的 change
```bash
bash harness/bin/create-change-scaffold.sh <change-id> [owner] [tier]
```

可选继续：

```bash
bash harness/bin/create-exploration-artifact.sh <change-id> <topic-kebab-case>
bash harness/bin/update-change-state.sh <change-id> DISCOVERED L2
bash harness/bin/set-active-change.sh <change-id>
```

## 4.4 跑结构与 contract 自检
```bash
bash hooks/validate-spec-structure.sh
bash hooks/full-verify.sh
```

---

## 5. 当前 MVP 的边界

## 已完成（可以算 MVP）

- repo contract 已成形
- portable runtime skeleton 已成形
- 本地 doctor / sync / bootstrap / install skeleton 可运行
- codegraph-first 真实可用
- Context7 CLI wrapper 真实可用
- active change + pre-write gate 真实可用
- change 生命周期通用命令已具备并 smoke test 通过
- Node runtime hook adapter 已落地并 smoke test 通过

## 尚未完成（还不是 MVP 已交付）

- plan gate 与更完整的 design gate / task gate 语义
- 更细粒度的 `RED_VERIFIED` 消费逻辑
- ArchUnit 真接入
- JaCoCo 85% 真接入
- 真实 HTTP API E2E
- 完整 OpenAPI 语义硬门禁
- 完整 installer / upgrade / migration 机制
- Windows / macOS 真机矩阵验证

所以当前最准确的状态是：

> **可运行的 repo contract + portable runtime MVP**

不是完整的企业级强门禁平台。

---

## 6. 后续迭代路线图

路线图已经写在：

- `harness/specs/mvp-roadmap.md`

简版如下：

### Iteration 1：门禁收紧
- design gate
- stale validation gate
- `RED_VERIFIED` 才允许生产源码写入
- reviewer verdict 消费逻辑更明确

### Iteration 2：Java 黄金样板增强
- ArchUnit
- JaCoCo 85%
- 真实 HTTP API E2E
- 更强 OpenAPI 契约语义校验

### Iteration 3：插件产品化
- machine-local adapter 正式 schema
- 更完整 installer
- upgrade / migration 机制
- 上游升级治理与版本盘点
- 平台验证矩阵与 prepublish 检查
- Windows / macOS 真机验证

---

## 7. 语言与协作约定

- 仓库文档、流程资产、评审说明默认使用**中文**
- 代码标识符、包名、公开 API 默认保持**英文**
- secrets / 本地 adapter / 本地 token 不提交进仓库

---

## 8. 公开仓库协作

当前仓库已补齐最小公开协作文件：

- `CONTRIBUTING.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`

对外协作时建议先看：

1. `README.md`
2. `CLAUDE.md`
3. `harness/specs/mvp-roadmap.md`
4. `harness/specs/upstream-governance.md`
5. `harness/specs/platform-compatibility.md`
6. `CONTRIBUTING.md`

---

## 9. 一句话总结

这个项目现在已经不是“几篇规则文档 + 一堆 bash 脚本”了，而是：

> **一套围绕 Claude Code 的企业后端交付骨架：有共享契约、有变更生命周期、有本地运行层、有跨机器接入入口，并且关键路径已经真实跑通。**
