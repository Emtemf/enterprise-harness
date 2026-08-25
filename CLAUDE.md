# Claude Code 运行合同

本仓库开发 Enterprise Harness Claude Code plugin。长期合同在 `harness/specs/`，插件资产在根目录 `skills/`、`agents/` 与 `hooks/`，动态状态在 active change 资产中。

## 已批准的开发目标

@harness/specs/development-target.md

上面的 imported target 是后续重构的目标，不代表仓库已经实现其中所有能力。判断当前行为仍须读取对应现行 spec、代码和 fresh evidence；不得把目标设计当作完成证据。

## 唯一入口

- 用户（plugin）：`/enterprise-harness:harness`
- 本仓库开发：`/harness`

阶段顺序固定为：

```text
clarify → design → plan → implement → verify → archive
```

不得从普通对话直接跳进 design、实现或完成声明。

## Clarify 方法论

Clarify 的方法来源、固定审阅 commit 与吸收/舍弃边界只保存在开发参考 `harness/specs/upstream-mapping.md` 和 `harness/upstream/registry.json`，不进入生产 Skill 指令。

核心原则：**Facts → Agent 找（CodeGraph/Context7）；全部 applicable Facts 完成后，Decisions → 用户决定。**

Clarify 使用 component × 5 核心维度（Goal / Scope / Constraints / Acceptance / Context），API/Data 只在 impact 相关时展开为条件分支。每次用 `AskUserQuestion` 只问一个问题，提供选项和推荐。

当需求已明确 + 代码事实已确认 + 无高风险 assumption 时，走 Fast Path（0~1 问题直接进 Design）。

详见 `harness/specs/ambiguity-scoring.md` 和 `skills/harness/SKILL.md`。

## 硬约束

- 代码探索必须派 `enterprise-harness:code-explore` subagent。
- 外部库、框架、SDK 和版本行为必须先尝试 Context7。
- clarify 必须落盘需求澄清结论（requirements.md）和 classification，确认 scope 后才可进入 design。
- design 必须覆盖适用的接口、错误模型、数据与 SQL、迁移和兼容性。
- implement 使用隔离 worktree implementer；execution strategy 由 task 决定（tdd/direct/migration 等）。
- Java/Maven 项目必须执行真实 `./mvnw` 或 `mvn` 的 `test`/`verify`。
- executor 与 checker 必须使用不同 run；checker 从 result artifact 获取输入。
- hooks 只做机械 gate、证据记录和恢复提示，不承担需求分析。
- 聊天不是状态真相；正式证据必须落入 change 目录、receipt 或 ledger。
- 没有 fresh validation、独立 checker 和 completion evidence 时不得声称完成。

## 受治理路径

以下路径受 pre/post-write gate 保护：

```text
src/main/java/**
src/test/java/**
openapi/**
```

只有当前 session 已绑定 change，或无 session 的兼容客户端存在 legacy `harness/ACTIVE_CHANGE` 时，才启用以下写入前置 gate。未绑定 session 属于未进入 Harness 的普通 Claude Code 会话，不能阻止其直接编辑这些常规代码路径。

启用治理后，写入前必须存在：

- 有效的 common-dir session binding；无 session 客户端兼容读取 `harness/ACTIVE_CHANGE`
- 已确认 clarify
- approved design 和 plan
- 当前 task
- scoped executor binding
- 由 `code-explore` agent 留下的 CodeGraph attempt（fallback 探索时须为同一 agent）
- 当前 task 有执行证据（receipt）

不得通过修改 `state.json` 投影伪造上述证据。

## 真相层

- 架构和边界：`harness/specs/architecture.md`
- 阶段流：`harness/specs/workflow.md`
- 状态：`harness/specs/state-schema.md`
- 接力：`harness/specs/agents-and-handoff.md`
- hooks：`harness/specs/hooks.md`
- evidence：`harness/specs/evidence.md`
- 测试：`harness/specs/testing.md`
- 发布：`harness/specs/distribution-and-release.md`

## 禁止事项

- 不要把 hooks 当总编排器。
- 不要让主 orchestrator 重新做已委托的代码探索。
- 不要把 `isolation: worktree` 当成上下文隔离；上下文隔离来自 forked stage skill 和独立 subagent。
- 不要给 `harness` 加 `context: fork`；它需要用户对话通道。
- 不要手改 `.claude/settings.json`；它由 `bin/generate-hooks.mjs` 生成。
- 不要接受 worker 自报的 RED/GREEN、review 或 validation。
- 不要静默吞掉关键 hook 异常。
- 不要修改 `harness/archive/**`。
- 不要把源仓库 evidence policy、changes、archive 或 work 打进发布包。

## 恢复

```bash
enterprise-harness status
enterprise-harness doctor
enterprise-harness workflow status --json
enterprise-harness handoff explain <EH-CODE>
```

本仓库开发时将 `enterprise-harness` 替换为 `node runtime/cli.mjs`。

当前研发快照只在 `docs/internal/current-development-status.md`，不属于安装合同或发布资产。
