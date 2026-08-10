# Claude Code 运行合同

本仓库开发 Enterprise Harness Claude Code plugin。长期合同在 `harness/specs/`，Claude 自动加载规则在 `.claude/rules/`，动态状态在 active change 资产中。

## 唯一入口

- 用户（plugin）：`/enterprise-harness:harness`
- 本仓库开发：`/harness`

阶段顺序固定为：

```text
clarify → route → design → plan → tdd → verify → archive
```

不得从普通对话直接跳进 design、实现或完成声明。

## 硬约束

- 代码探索必须派 `enterprise-harness:code-explore` subagent。
- 外部库、框架、SDK 和版本行为必须先尝试 Context7。
- clarify 必须落盘七维歧义评分；关键维度均不低于 4，并由用户确认 scope 后才可 route。
- design 必须覆盖适用的接口、错误模型、数据与 SQL、迁移和兼容性。
- TDD 必须由隔离 `tdd-executor` 执行任务冻结的 exact argv。
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

写入前必须存在：

- 有效 `harness/ACTIVE_CHANGE`
- 已确认 clarify/route
- approved design 和 plan
- 当前 task
- scoped executor binding
- 由 `code-explore` agent 留下的 CodeGraph attempt（fallback 探索时须为同一 agent）
- 当前 task 的真实 RED receipt

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
- 不要让 forked stage skill 代替用户确认 scope 或 route。
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

本仓库开发时将 `enterprise-harness` 替换为：

```bash
node runtime/cli.mjs
```

当前研发快照只在 `docs/internal/current-development-status.md`，不属于安装合同或发布资产。
