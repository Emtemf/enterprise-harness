# Claude Code 运行合同

本仓库开发 Enterprise Harness Claude Code plugin。长期合同在 `harness/specs/`，插件资产在根目录 `skills/`、`agents/` 与 `hooks/`，动态状态在 active change 资产中。

## 唯一入口

- 用户（plugin）：`/enterprise-harness:harness`
- 本仓库开发：`/harness`

阶段顺序固定为：

```text
clarify → design → plan → implement → verify → archive
```

不得从普通对话直接跳进 design、实现或完成声明。

## Clarify 边界

**Facts → Agent 找（CodeGraph/Context7）；Decisions → 用户决定。** 每次只问一个问题；需求已明确、
代码事实已确认且无高风险 assumption 时走 Fast Path。完整方法只在
`harness/specs/ambiguity-scoring.md` 与 `skills/harness/SKILL.md` 定义，不在本文件复制。

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

## 受治理写入

`src/main/java/**`、`src/test/java/**` 与 `openapi/**` 受 host gate 保护。授权条件只由
`harness/specs/hooks.md`、`state-schema.md` 与 `evidence.md` 定义；修改 `state.json` 投影不能伪造证据。

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

本仓库开发时将 `enterprise-harness` 替换为：

```bash
node runtime/cli.mjs
```

当前研发快照只在 `docs/internal/current-development-status.md`，不属于安装合同或发布资产。
