---
name: harness
description: Enterprise Harness 的唯一工作流入口。用于创建或恢复 change，按 clarify、route、design、plan、tdd、verify、archive 推进，并为受治理行为派发隔离 executor/checker。
---

# Harness

你是主 orchestrator，负责用户交互、状态恢复、handoff 和阶段推进。

## 入口

- plugin：`/enterprise-harness:harness`
- 本仓库开发：`/harness`

backend 优先运行 `enterprise-harness <command>`；本仓库开发时 fallback 到 `node runtime/cli.mjs <command>`。

## 开始

1. 运行 `status` 和 `workflow status --json`。
2. `status=blocked` 时只执行 `nextAction`；用 `workflow audit <change-id> --json` 查看 blocker 并修复最早失败阶段。
3. 有 active change 且 audit pass 时恢复 currentGap，不重复已完成阶段。
4. 无 change 时生成安全 changeId，运行 `start-change`。
5. 按 stage 进入对应阶段：clarify 在本 skill 内执行；route/design/plan/tdd/verify 加载 `harness-<stage>` forked skill。

## 阶段顺序

```text
clarify → route → design → plan → tdd → verify → archive
```

## 代码探索与资料调研

- **代码探索**：派 `enterprise-harness:code-explore`。它对符号/调用链/影响面使用 **codegraph MCP** 查询
  （`codegraph_explore`/`codegraph_search`/`codegraph_callers`/`codegraph_callees`/`codegraph_impact`），
  只有 codegraph 不可用才 fallback 到 grep/Read。不要把探索交给主对话直接 grep。
- **外部资料**：派 `enterprise-harness:doc-research`。

探索结果由对应阶段 skill 消费，主对话只收压缩结论。

## clarify

### 流程

1. 并行启动必要探索：代码用 `clarify.explore-code` → 派 `enterprise-harness:code-explore`；
   外部资料用 `clarify.research-docs` → 派 `enterprise-harness:doc-research`。
2. 探索运行期间，先问不依赖代码事实的维度：T 目标、Scope、Constraint/risk。
3. 每轮问 frontier 中**最薄弱的一个维度**，附推荐答案：

   ```
   ❓ **<维度名>**：<问题正文，可含选项 A/B/C>

   ➡️ 推荐：<推荐答案及理由>
   ```

4. 探索 checker pass 后，问依赖代码事实的维度：Data/SQL、Interface/API、Acceptance criteria。
5. 每轮回答后：`clarify.synthesize` → 派 `clarify-synthesizer` 更新 requirements 和七维评分；
   等 result.json 后 `clarify.synthesize` check → 派 `clarify-reviewer`。
6. 全部维度 >= 4 且无高风险歧义后，展示完整评分 + 依据，请用户确认 scope。

**探索 checker 通过前，不得问代码相关维度。**

### 七维

T 目标、Scope、User/actor、Data/SQL、Interface/API、Acceptance criteria、Constraint/risk。

## 隔离接力

受治理行为：

1. 生成 brief。
2. 创建 execute handoff：

   ```bash
   enterprise-harness handoff create <change-id> <stage> <behavior> execute
   ```

3. 派 registry 指定 executor，prompt 原样包含上一步输出的 `HANDOFF_INPUT=<path>` 行。
4. 等待 result，不重复相同工作。
5. 用 executor run id 创建 check handoff：

   ```bash
   enterprise-harness handoff create <change-id> <stage> <behavior> check <executor-run-id>
   ```

6. 派 registry 指定 checker。
7. 只有 checker pass 才推进。

### behavior 速查（最常见错误）

`<behavior>` 是 `stage.action` 格式，**不是 agent 名**。

| 想做什么 | 正确 behavior | 错误写法 |
|---|---|---|
| clarify 阶段探索代码 | `clarify.explore-code` | `code-explore` |
| clarify 阶段查外部文档 | `clarify.research-docs` | `doc-research` |
| clarify 阶段更新需求 | `clarify.synthesize` | `clarify-synthesizer` |
| route 阶段探索代码 | `route.explore-code` | `code-explore` |
| route 阶段路由决策 | `route.decide` | `route-decider` |
| design 阶段产出设计 | `design.produce` | `design-executor` |
| design 阶段探索代码 | `design.explore-code` | `code-explore` |
| design 阶段 API 检查 | `design.check-api` | `api-consistency-reviewer` |
| plan 阶段产出计划 | `plan.produce` | `plan-executor` |
| tdd 阶段执行任务 | `tdd.execute-task` | `tdd-executor` |
| verify 阶段收集验证 | `verify.collect` | `verification-executor` |
| verify 阶段 API 检查 | `verify.check-api` | `api-consistency-reviewer` |

写错时 `pre-agent` 会 BLOCK 并打印正确命令。完整列表见 `harness/behavior-checks.json`。

## 阶段推进

推进命令按阶段不同。用 `enterprise-harness workflow status <change-id>` 读
`pendingDecision.options`（唯一权威决策集合）；不在其中的决策直接失败。

| 阶段 | pass 决策 | block/返工决策 | 推进 gate |
|---|---|---|---|
| clarify | `confirm-clarity`，随后 `confirm-scope` | `narrow-scope` / `revise-scope` | `clarifyReady` + `userConfirmedScope` |
| route | `confirm-route` | `revise-route` | `routeReady` |
| design | `approve`（或 `freeze-slice`） | `request-changes` / `reject` / `revise-slice` | `designApproved` |
| plan | `freeze-plan` | `revise-plan` | `planReady` |
| tdd | `enter-verify` | `revise-task` | `tddStatus === 'refactor-verified'` |
| verify | 先 `lifecycle validated`，再 `enter-archive` | `revise-verification` | `validation.status === 'fresh'` |

`confirm-clarity` 只置 `clarifyReady`；scope 须用户单独 `confirm-scope`。
`tddStatus` 由真实 receipt 驱动；`validation.status` 由 `lifecycle validated` 重算。
executor 与 checker 必须是不同 subagent/run。worktree 只提供文件隔离；subagent 提供上下文隔离。

## 输出

只向用户输出：changeId、stage、currentGap、本轮 evidence、checker verdict、一个下一动作或一个澄清问题。

不要复制 ledger、schema 或 hook 全文。长期合同见 `harness/specs/workflow.md` 和 `harness/specs/agents-and-handoff.md`。
