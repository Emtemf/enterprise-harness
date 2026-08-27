# 六阶段工作流

Enterprise Harness 的唯一生命周期是：

```text
clarify → design → plan → implement → verify → archive
```

Classification 是 clarify 后的内部制品；TDD、regression、direct 等是 implement task 的
execution strategy。它们都不是额外 stage。

## 查看实际执行情况

不要只根据聊天中的“完成”判断进度：

```bash
# 当前阶段、最早 blocker 和唯一合法的下一动作
enterprise-harness workflow status <change-id> --json

# 已完成阶段的 artifact、execute result、独立 review 和 digest 是否完整
enterprise-harness workflow audit <change-id> --json

# plan 冻结后验证静态阶段链并生成 stage-gate marker
enterprise-harness validate <change-id>

# 从 agent ledger 渲染实际时序
enterprise-harness trace --change <change-id> --mermaid
```

`status=blocked` 且顶层 `nextAction` 不等于当前 `nextEntry` 时，只执行该 pre-entry recovery，不要根据投影的
stage 或 nextStage 自行推进。`nextAction=/harness` 是当前入口；nested Clarify readiness 由 controller 路由。
非阻断状态的用户决策只能来自 `pendingDecision.options`；stage transition 则必须由对应 readiness 和 lifecycle
命令授权。`workflow audit` 返回 0 表示已完成阶段的证据符合合同，返回 2 表示存在阻断项。

## clarify

目的：把原始请求变成有依据、可验收且由用户确认的执行范围。

Harness 先区分 Facts 与 Decisions：代码路径、调用链和 schema 由隔离的 CodeGraph-first worker
查找；适用的外部库、SDK 与版本行为由 Context7-first worker 查找。所有 required ResearchPacket
都完成、校验并持久化后，Main 才开始 topology 和用户澄清。业务意图、scope、兼容性取舍和风险
接受才问用户。

澄清流程：

1. 判定 code/docs fact lanes；适用时派发 CodeGraph 与 Context7 worker，并等待全部 packet 完成。
2. 枚举 1–6 个 top-level components，请用户确认 add/remove/merge/split/defer。
3. 对每个 active component 的 Goal / Scope / Constraints / Acceptance / Context 做 0–5 评分。
   分数由 readiness predicates 计算：达到 4 必须覆盖该维度全部谓词，达到 5 还需用户确认；每个谓词
   都引用 Evidence ledger 中与原始请求、已解决用户决定或 validated ResearchPacket fact 精确匹配的独立分句；
   同一分句不能重复支撑多个评分项，模型也不能自行声明一条模糊描述覆盖整张评分表。
   API/Data 只在 impact 相关时展开；登录/认证类需求还会展开身份、凭证、Session、失败与滥用控制、
   恢复/MFA 和可观察验收等风险覆盖面，但不会机械地把它们全部问给用户。
4. 每轮选择 weakest / highest-risk Decision frontier，使用 Claude Code 原生 `AskUserQuestion` 只问一个
   decision，推荐选项放第一。
5. 回答后重新评分并展示变化；用户可以修正 topology、评分或 scope。

同时展示一个只读的“歧义指数”：`未覆盖的适用 predicate 数 / 适用 predicate 总数 × 100`。指数越低表示
证据覆盖越完整，0 表示没有剩余 predicate 歧义；它还会同时展示每个 component 的最低维度分数和未决
高风险数量。自由文本声明存在但没有结构化 Frontier 行时，高风险数量显示为未知（`null/untracked`），不会
伪造一个近似数量。该指数由 Evidence ledger 与评分表机械派生，只在 runtime 状态和用户摘要中展示，
不能写回 requirements 手工维护，也不替代“全部维度至少 4 分、
无高风险未决项、无 pending question”的正式门禁。

需求已明确时走 Fast Path：先生成 provisional topology、评分和 requirements 摘要；原始请求已
明确授权完整 scope 时无需追加问题，否则用一次问题联合确认。评分、事实证据、scope confirmation
和独立 review 门槛不降低。任一关键分数低于 4、仍有高风险 assumption 或 evidence stale 时都停在 clarify。

成功表现：requirements、classification、debt/project-contract assessment、不可变 decision snapshot
全部 fresh，Clarify StageResult 已绑定这些产物并通过独立 review、TECPC 与 fresh CompletionProof。
单独确认 scope 或生成 classification 都不会跳过这条 completion gate。

## design

目的：冻结实现前技术合同。

Design 只消费已确认 requirements、classification 和 digest-bound research facts。API/Data
仅在 impact 适用时加载对应设计分支。产物必须覆盖适用的接口、错误模型、数据与 SQL、迁移、
兼容性和测试策略，并通过 self-check 与独立 review。

缺少业务决定时 worker 返回一个 `NEEDS_DECISION`，由主 Harness 转成用户问题；worker 不猜测。

## plan

目的：把 design 拆成可独立执行、审查、回滚和验证的 task。

每个 task 冻结稳定 ID、in/out scope、write paths、一个 execution strategy、exact argv、验收、
recovery 和 reviewer 输入。不得使用“按需要修改”或“运行相关测试”之类不可机械执行的描述。

## implement

目的：在隔离 worktree 中按每个 task 的冻结 strategy 实现产品变更。

- `tdd`：RED → GREEN → REFACTOR；
- `regression`：REPRODUCE → VERIFY；
- `characterization`：BASELINE → VERIFY；
- `direct`：说明 RED 不适用并执行 VERIFY；
- `migration`：DRY_RUN → APPLY → ROLLBACK；
- `generation`：GENERATE → VERIFY。

所有命令通过 task runner 执行并产生 machine-generated receipt。Implementer 的 self-check 不等于
批准；每个 task 还需要独立 reviewer。若 stage-gate marker stale，重新验证阶段链后再写。

## verify

目的：执行冻结 validation argv，消费 task receipts、reviews、ledger 与 fresh artifacts，形成
最终 validation 和独立 final review。

用户只处理真正需要接受或拒绝的 advisory。缺失、unsupported 或 stale evidence 不能被聊天中的
“已经验证”替代。

## archive

目的：在 completion predicate 全部通过时冻结变更历史并清理 active change。

Archive 与最终完成声明使用同一套 fresh evidence。不能通过直接编辑 `state.json`、复制聊天输出
或强制移动目录伪造成功。

## 下游交接坑点

插件维护一份跨阶段共享检查清单，供各阶段自检和独立 reviewer 使用。它重点拦截：Clarify 过早提问或
机械扩面、Design 需求追踪断裂、Plan 的模糊 argv/write scope、Implement 绕过 runner 或伪造策略证据、
Review 不独立、Verify/E2E 缺少可观察验收，以及 Archive 的部分发布与残留指针。命中项必须附 durable
evidence ref，并回到最早失效 gate；清单不会增加新的 lifecycle stage。

## 上下文与文件隔离

主 Harness 保留用户对话。代码/文档事实探索、artifact 生成、实现和 review 分别在独立 agent
上下文中完成；worktree 提供文件隔离，subagent 提供上下文隔离，Handoff v2 提供 digest-bound
接力。每个阶段遵循：

```text
execute → self-check → independent review → TECPC → fresh evidence
```
