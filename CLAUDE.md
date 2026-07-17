# Enterprise Harness（本地 Claude Code 骨架）

## 愿景

本项目的目标是把 Claude Code 变成一个适合企业 Java 后端交付的本地 harness：让较弱模型也能在明确约束下，稳定完成需求分流、设计、计划、TDD、验证与归档。

## 本项目做什么

- 面向 **Java 后端 / Spring Boot** 场景
- 默认采用 **codegraph-first** 的代码探索策略；失败后才允许 grep / Read fallback，并要求留痕
- 涉及外部库、框架、SDK 或版本行为时，默认采用 **Context7-first** 文档检索；不足时再查官方文档
- 默认工作流是：**需求 intake → design → plan → TDD → review → validation → archive**
- 采用 OpenSpec-like 的资产分层，但品牌与结构以内建 `harness/` 为准
- 采用 Clean Architecture / DDD 风格的 Java 分层、MapStruct 映射、BDD 风格测试与后端 API E2E

## 本项目当前不做什么

- 不做前端页面点击测试
- 不把聊天上下文当成唯一状态来源
- 不把项目根 `rules/` 或 `agents/` 当成运行时唯一真相
- 不在 codegraph 可用时直接跳过到 grep
- 不在缺少设计、RED 证据或新鲜验证时直接推进实现或宣称完成

## 当前自动加载入口

当前项目的自动加载入口以 `.claude/` 为准：

- `.claude/rules/`：项目规则
- `.claude/agents/`：项目 reviewer / subagent
- `.claude/skills/`：项目 skill
- `.claude/settings.json`：项目 hooks / settings

项目根目录中的下列内容目前视为**历史参考或迁移来源**：

- `rules/`
- `agents/`

## 显式入口模型

当前仓库采用三层模型：

1. **Skill 入口**：对用户只有一个前门——在 Claude Code 会话中统一从 `/harness` 开始；它负责 clarify-first staged workflow 的单一入口与阶段路由
2. **Command 后台动作**：在本机/runtime 场景中，优先使用 `node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]`、`bootstrap`、`doctor`、`sync`、`verify` 这类确定性 backend 动作
3. **Hooks 自动门禁**：`.claude/settings.json` 中的 SessionStart / PreToolUse / PostToolUse / Stop 负责自动提醒、阻断、恢复提示和校验

规则与 hooks 会自动生效，但它们不是总编排器；对用户的总入口应始终显式保持为 `/harness`，不要把 backend command 暴露成并列前门。

## 默认工作流

对 L1 及以上代码/配置行为变化，默认按以下顺序推进：

1. 先进入 `clarify`：先探索代码/文档，再进行一问一答澄清与用户确认
2. 形成 final route（L0 / L1 / L2 / L3）
3. 完成 durable design
4. design 批准后进入 plan
5. 严格执行 RED → GREEN → REFACTOR
6. 统一在 `verify` 阶段消费 reviewer verdict 与验证证据
7. 必要时归档到 `harness/changes/`、`harness/specs/`、`harness/archive/`

## 编码与架构基线

- Java 分层：`interfaces` / `application` / `domain` / `infrastructure`
- `interfaces` 只暴露 `Req` / `Rsp`
- `application` 使用 DTO
- `domain` 放领域对象、策略和 repository port
- `infrastructure` 放持久化与外部适配器，持久化对象以 `*Entity` 结尾
- 跨层映射默认使用 MapStruct
- 测试默认采用 BDD 风格命名与 `@DisplayName`
- API E2E 指真实 HTTP 后端场景编排，不包含 UI 点击

## 验证

当前阶段的本地验证仍以轻量脚本为主：

- `hooks/validate-spec-structure.sh`
- `hooks/validate-openapi.sh`
- `hooks/validate-controller-consistency.sh`

统一的 full verification 入口仍在后续阶段建设中；在它落地前，不得把现有轻量脚本误当成完整企业级门禁。

## 资产位置

- 进度快照：`PROGRESS.md`
- 稳定规范：`harness/specs/`（含 `staged-workflow.md` / `session-lifecycle.md`）
- 活动 change：`harness/changes/`
- 活动历史工作：`harness/work/`
- 探索证据：`harness/explorations/`
- 模板：`harness/templates/`

## 当前成熟度说明

本项目当前仍处于 **Bootstrap MVP + Requirement Intake 强化中**：

- 治理骨架已存在
- `.claude/` 自动加载层正在迁移成真实运行面
- Java 参考服务仍是演示样例，不是最终企业黄金样板
- 85% 覆盖率、ArchUnit、MapStruct、真实 HTTP API E2E、统一 full validation 仍在后续阶段补齐

## 语言约定

- 仓库文档、流程资产、评审说明默认使用中文
- 代码标识符、包名、公开 API 默认保持英文
