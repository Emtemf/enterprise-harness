# Enterprise Harness（本地 Claude Code 骨架）

## 愿景

本项目的目标是把 Claude Code 变成一个适合企业 Java 后端交付的本地 harness：让较弱模型也能在明确约束下，稳定完成需求分流、设计、计划、TDD、验证与归档。

## 承重墙（为什么 SOP 要这么厚）

第一性目标是**给较弱模型兜底**：模型在缺约束时会跳步、糊弄验收、丢失状态。因此本项目用“厚 SOP + 机械门禁 + durable 状态”替代“模型自觉”。

任何“为了更简洁而削薄流程”的改动，都必须先回答：
- 是否削弱了 TECPC 的可见性？
- 是否削弱了 reviewer / verify / stop 的完成态闭环？
- 是否把原本机械可验证的行为退化成纯 prompt 约束？

## 设计谱系（摘要）

当前设计来源的摘要如下：

- **分阶段 SOP / staged UX** ← Superpowers
- **change / spec / archive 资产模型** ← OpenSpec
- **苏格拉底式 clarify** ← deep-interview（来自 oh-my-claudecode）
- **durable state / 可恢复工作空间** ← gump-agent-workspace
- **角色视角增强** ← role-workbench（当前仍为 draft）
- **代码/文档探索工具** ← CodeGraph / Context7

深入说明见：
- `harness/specs/upstream-mapping.md`

## 当前架构原则（Phase 1）

本项目当前以 **Claude Code-only phase 1** 为主：

- 先把 Claude Code 内部的 staged workflow、恢复入口、double-check、TDD 执行链打透
- 先验证单平台的一致性和可测性
- 跨平台 / 非 Claude host 兼容放在后续 phase 2 再考虑

注意：**Claude Code-only 不等于删除 `harness/` 目录**。当前预期是：
- `.claude/` 收口前门、skills、agents、rules、hooks 配置入口
- `harness/` 继续承载 specs、templates、changes、archive、动作层与统一业务原语

深入说明见：
- `harness/specs/claude-code-only-phase1.md`

## 当前分层模型

### 用户前门
- plugin install：`/enterprise-harness:harness`
- standalone checkout：`/harness`

### 核心探索能力
- **CodeGraph-first**：代码探索默认走 `code-explore`
- **Context7-first**：文档探索默认走 `doc-research`
- 这两条探索 lane 是本项目 phase 1 的核心亮点，不是附属工具
- 代码探索必须委托 subagent，并消费 subagent 返回结论后再继续，不得忽略结论后重复探索同一问题
- 歧义度评分必须在 clarify 阶段显式展示，并保持一次只问一个问题

### 阶段恢复入口
- plugin 使用 `/enterprise-harness:harness-intake|design|plan|tdd|verify`
- standalone 使用 `/harness-intake|design|plan|tdd|verify`

### 职责边界
- **skill**：阶段方法论、TECPC 检查、用户可见引导
- **agent**：专职执行角色（explore / reviewer / executor）
- **hook/runtime**：机械门禁、durable state、确定性 backend 动作
- **spec**：单一真相层

深入说明见：
- `harness/specs/agent-skill-boundary.md`
- `harness/specs/staged-workflow.md`

## 当前自动加载入口

当前项目的自动加载入口以 `.claude/` 为准：

- `.claude/rules/`：项目规则
- `.claude/agents/`：项目 reviewer / subagent
- `.claude/skills/`：项目 skill
- `.claude/settings.json`：项目 hooks / settings

## 默认工作流（摘要）

对 L1 及以上代码/配置行为变化，默认按以下顺序推进：

1. `clarify`
2. `route`
3. `design`
4. `plan`
5. `tdd`
6. `verify`
7. `archive`

阶段 contract 的深入说明见：
- `harness/specs/staged-workflow.md`
- `harness/specs/ambiguity-scoring.md`
- `harness/specs/context-packet.md`
- `harness/specs/exploration-packet.md`

## 当前硬约束

### 实现前 orchestration guardrail（硬约束）
- 未完成 clarify / route、未获得用户 scope 确认、或未满足累计执行前置条件时，不得开始写业务代码、设计落地代码、任务推进代码或任何实现动作

### 1. TECPC 可见性
- **每步操作后必须输出 TECPC 状态卡**，不能只依赖 hook 输出

### 2. 等待后台任务
- **等待 subagent / 后台任务时禁止轮询刷屏**
- 当 `Agent`、`Monitor`、后台 Bash 或其他 Claude Code 可通知的任务已启动后，主 orchestrator 不得通过 `sleep`、倒计时、循环“继续等待”或伪进展输出占用对话
- 默认做法是：启动任务后立即停手，等待 `<task-notification>` 或用户下一条真实消息

### 3. 代码探索
- **代码探索必须委托 `code-explore` subagent**
- 主 orchestrator 不得自己直接用 grep/Read 搜索业务代码
- 默认采用 **codegraph-first**；失败后才允许 grep / Read fallback，并要求留痕

### 4. TDD 执行
- **TDD 必须通过 subagent 执行**
- **必须使用 `isolation: "worktree"`**
- **必须通过 `tdd-run` 执行真实项目命令**：如 tasks 冻结的 `mvn test` / `mvn verify`
- worker 文本不构成完成证据；必须有 runtime receipt、`evidence-import` 与独立 review
- 主对话禁止直接写生产代码

### 5. 实现前门禁
在进入实现前，至少必须满足：
- 已通过当前运行面的 canonical harness skill 建立 current change
- 已完成 `clarify`（或至少 clarify-ready 并获得用户确认）
- 已完成 `route`

## 编码与架构基线

- Java 分层：`interfaces` / `application` / `domain` / `infrastructure`
- `interfaces` 只暴露 `Req` / `Rsp`
- `application` 使用 DTO
- `domain` 放领域对象、策略和 repository port
- `infrastructure` 放持久化与外部适配器，持久化对象以 `*Entity` 结尾
- 跨层映射默认使用 MapStruct
- 测试默认采用 BDD 风格命名与 `@DisplayName`
- API E2E 指真实 HTTP 后端场景编排，不包含 UI 点击

## 验证边界（摘要）

当前阶段的本地验证仍以轻量脚本为主：

- `validate-spec-structure.sh`
- `validate-openapi.sh`
- `validate-controller-consistency.sh`（当前仍仅用于 `reference-service` 自身回归，不是任意项目通用 controller/OpenAPI 交叉校验器）

统一 full verification 仍在后续阶段建设中；不得把现有轻量脚本误表述成完整企业级门禁。

## 资产位置

- 进度快照：`PROGRESS.md`
- 稳定规范：`harness/specs/`
- 活动 change：`harness/changes/`
- 探索证据：`harness/explorations/`
- 模板：`harness/templates/`
- 上游基线：`harness/upstream/registry.json`

## 深入阅读导航

- `harness/specs/README.md` — specs 真相层目录索引与建议阅读顺序

### 如果你要理解“为什么这样设计”
- `harness/specs/claude-code-only-phase1.md`
- `harness/specs/claude-code-only-phase1-blueprint.md`
- `harness/specs/upstream-mapping.md`
- `harness/specs/agent-skill-boundary.md`
- `harness/specs/hook-adapter-and-primitives.md`

### 如果你要理解“当前 workflow 怎么跑”
- `harness/specs/staged-workflow.md`
- `harness/specs/session-lifecycle.md`
- `harness/specs/plugin-runtime.md`
- `harness/specs/double-check-model.md`
- `harness/specs/reviewer-verdict-contract.md`
- `harness/specs/verify-contract.md`

### 如果你要理解 clarify / 探索 / 评分
- `harness/specs/ambiguity-scoring.md`
- `harness/specs/context-packet.md`
- `harness/specs/exploration-packet.md`
- `harness/specs/brief-contract.md`

### 如果你要理解 TDD 专职执行 contract
- `harness/specs/tdd-execution.md`

## 当前成熟度说明

本项目当前仍处于 **Bootstrap MVP + Requirement Intake 强化中**：

- 治理骨架已存在
- `.claude/` 自动加载层正在迁移成真实运行面
- Java 参考服务仍是演示样例，不是最终企业黄金样板
- 85% 覆盖率、ArchUnit、MapStruct、真实 HTTP API E2E、统一 full validation 仍在后续阶段补齐

## 语言约定

- 仓库文档、流程资产、评审说明默认使用中文
- 代码标识符、包名、公开 API 默认保持英文
