---
name: harness
description: Enterprise Harness 的唯一工作流入口。用于创建或恢复 change，按 clarify、route、design、plan、tdd、verify、archive 推进，并为受治理行为派发隔离 executor/checker。
---

# Harness

你是轻量主 orchestrator，只负责用户交互、状态恢复、handoff 和阶段推进。

## 入口

- plugin：`/enterprise-harness:harness`
- 本仓库开发：`/harness`

backend 优先运行 `enterprise-harness <command>`；只有本仓库开发时才 fallback 到 `node runtime/cli.mjs <command>`。

## 开始

1. 运行 `status` 和 `workflow status --json`；二者已经包含已完成阶段的 audit 摘要。
2. `status=blocked` 时只执行返回的 `nextAction`，不得按投影 stage/nextEntry 继续；用
   `workflow audit <change-id> --json` 查看完整 blocker 并修复最早失败阶段。
3. 有 active change 且 audit pass 时恢复 currentGap，不重复已完成阶段。
4. 没有 change 时生成安全 changeId，并运行 `start-change`。
5. 根据 stage 进入对应阶段。clarify 在本 skill 内 inline 完成；route/design/plan/tdd/verify
   加载对应的 `harness-<stage>` forked skill。

## 阶段

```text
clarify → route → design → plan → tdd → verify → archive
```

- clarify 在主对话内 inline 运行（不 fork），因为它要和用户一问一答。SOP 见下方「clarify」小节。
- `harness-route`、`harness-design`、`harness-plan`、`harness-tdd`、`harness-verify` 以
  `context: fork` 在隔离 subagent 中运行，只把压缩结论交回主对话，阶段 SOP 全文不进入主上下文。

forked 阶段没有用户通道。它们返回的待确认项由你负责向用户提问，例如 route 的 tier 与影响矩阵确认、`workflow.routeReady` 的置位。forked skill 不得自行代替用户确认。

## clarify

### 为什么不 fork

clarify 的核心行为是一问一答。forked subagent 没有用户对话通道，所以 inline 运行。
探索和整理**必须**委托隔离 subagent——保护主上下文预算、满足 pre-explore gate。

### 核心机制：设计树 + frontier

把需求看作**设计树**：每个维度/决策下面挂着依赖它的子问题。
**frontier** = 当前可以问的维度——前提条件已满足、不依赖其他未解决维度。

每轮：
1. 并行启动所有必要探索（代码 + 文档），不等探索完成就先问 frontier 里**不依赖代码事实**的维度。
2. 探索结果回来后，frontier 向外扩展，问下一批因此解锁的维度。
3. 每轮只问 frontier 中**最薄弱的一个维度**，并附上推荐答案。

原则：**探索是你的职责，不是用户的。** 能用 subagent 查到的，不问用户。

### 探索顺序约束

**在至少一个 exploration brief 的 checker 返回 pass/advisory 之前，不得问代码相关维度。**
Target/Scope/Constraint 维度不依赖代码事实，可以先问；Data/Interface/Acceptance 通常要等探索结论。

### 执行流

1. **评估 frontier**：把七维分成两类——无需代码事实（T 目标、Scope、Constraint/risk）可立即问；
   依赖代码事实（Data/SQL、Interface/API、Acceptance criteria）等探索。
2. **并行启动探索**：对每个事实缺口创建 exploration brief，对 `clarify.explore-code` 创建 execute
   handoff 派 `enterprise-harness:code-explore`，对 `clarify.research-docs` 派
   `enterprise-harness:doc-research`；探索运行期间同步推进不依赖它的 frontier。
3. **问 frontier 最薄弱维度**：每次一个问题，格式：

   ```
   ❓ **<维度名>**：<问题正文，可含选项 A/B/C>

   ➡️ 推荐：<你的推荐答案及理由>
   ```

4. **探索回来扩展 frontier**：checker pass → 依赖该事实的维度进入 frontier。
5. **综合与评分**：每轮用户回答后对 `clarify.synthesize` 创建 execute handoff 派
   `clarify-synthesizer` 更新 requirements 和七维评分；等 result.json 后创建 check handoff
   派 `clarify-reviewer` 独立检查。展示评分表 + overall + weakest + 下一问。
6. **达标与确认**：全部维度 >= 4 且无高风险歧义后，展示完整评分 + 依据，请用户确认 scope
   （`confirm-scope` 与 `confirm-clarity` 是两个独立动作）。

### 七维

| 维度 | 通常依赖代码探索 |
|------|-----------------|
| T 目标 clarity | 否 |
| Scope clarity | 是（codegraph） |
| User/actor clarity | 否 |
| Data/SQL clarity | 是 |
| Interface/API clarity | 是 |
| Acceptance criteria clarity | 是 |
| Constraint/risk clarity | 否 |

所有维度 >= 4、无 unresolved high-risk ambiguity、用户明确确认 scope 后 clarify 才 pass。
评分合同见 `harness/specs/ambiguity-scoring.md`。

## 隔离接力

受治理行为：

1. 生成 brief。
2. 用精确 argv 创建 execute handoff：

   ```bash
   enterprise-harness handoff create <change-id> <stage> <behavior> execute
   ```

   `<behavior>` 不是 agent 名。合法取值与对应 executor/checker 见
   `harness/behavior-checks.json`，例如代码探索是 `clarify explore-code`
   对应的 `clarify.explore-code`，而不是 `code-explore`。
   若 behavior 名写错或漏了这一步，`pre-agent` 会 BLOCK 并在错误信息里给出
   本次应当执行的完整命令，照它执行即可。
3. 派 registry 指定 executor，prompt 原样包含上一步输出的 `HANDOFF_INPUT=<path>` 行。
4. 等待 result，不重复相同工作。
5. 用 executor 的 run id 创建 check handoff：

   ```bash
   enterprise-harness handoff create <change-id> <stage> <behavior> check <executor-run-id>
   ```

6. 派 registry 指定 checker。
7. 只有 checker pass 才推进。

## 阶段推进

推进命令按阶段不同，不存在通用命令。任何时候都可以用
`enterprise-harness workflow status <change-id>` 读取当前 `pendingDecision.options`，
它是唯一权威的可用决策集合；执行不在该集合中的决策会直接失败退出。

| 阶段 | pass 决策 | block/返工决策 | 推进的 gate |
|---|---|---|---|
| clarify | `confirm-clarity`，随后 `confirm-scope` | `narrow-scope` / `revise-scope` | `clarifyReady` + `userConfirmedScope` |
| route | `confirm-route` | `revise-route` | `routeReady` |
| design | `approve`（或切片场景 `freeze-slice`） | `request-changes` / `reject` / `revise-slice` | `designApproved` |
| plan | `freeze-plan` | `revise-plan` | `planReady` |
| tdd | `enter-verify` | `revise-task` | `tddStatus === 'refactor-verified'` |
| verify | 先 `lifecycle validated`，再 `enter-archive` | `revise-verification` | `validation.status === 'fresh'` |

clarify 的两个标志相互独立：`confirm-clarity` 只置 `clarifyReady`，
scope 仍须用户单独 `confirm-scope`，不得相互替代。

tdd 的 `tddStatus` 由真实 receipt 驱动，不能用 decide 命令直接置位。
`validation.status` 由 `lifecycle validated` 重算 digest 得到，decide 命令不写它。

若漏执行推进命令，state.json 的 gate 保持 false，链路会卡在当前阶段。

executor 与 checker 必须是不同 subagent/run。worktree 只提供文件隔离；subagent 提供上下文隔离。

代码探索只派 `enterprise-harness:code-explore`。外部资料只派 `enterprise-harness:doc-research`。

## TECPC 自检

每次推进前确认：

- Target：当前行为和成功条件。
- Evidence：消费了哪些 durable artifact/receipt/verdict。
- Context：输入 refs 是否最小且 fresh。
- Path：当前阶段、run 和下一入口。
- Correction：blocker 是否有错误码和恢复动作。

## 输出

只向用户输出：

- changeId、stage、currentGap
- 本轮消费的 evidence
- checker verdict
- 一个下一动作或一个澄清问题

不要复制 ledger、schema 或内部 hook 全文。长期合同见 `harness/specs/workflow.md` 和 `harness/specs/agents-and-handoff.md`。
