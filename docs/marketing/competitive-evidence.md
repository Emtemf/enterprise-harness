# Enterprise Harness 竞争证据基线

> 截止 2026-09-09。本文是推广主张的唯一证据入口，不是“竞品打分榜”。结论仅适用于 Claude Code 中的企业软件变更治理。

## 一句话定位

Enterprise Harness 不是更轻的提示词包，而是把“先取证、再决策、后设计与实施、最后凭新鲜证据归档”做成 Claude Code runtime 可拒绝的交付协议。

最稳妥的推广文案是：

> 当团队更在意可审计、可恢复、不能跳过验证的交付过程时，Enterprise Harness 提供了 Superpowers 和 OpenSpec 默认工作流没有提供的 digest、identity、receipt 与 stage gate。

不要使用“所有场景都更好”“已经证明更省 token”“用了 Harness 就不会出错”或“竞品没有企业能力”。

## 比较对象与公平边界

| 系统 | 固定版本 | 它真正擅长的事 | 本比较不否认的优势 |
|---|---|---|---|
| Enterprise Harness | 0.5.31 candidate | Claude Code 内的机械门禁、证据链、恢复和审查 | 代价更重，目前只支持 Claude Code |
| Superpowers | [v6.3.0](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797) | brainstorming、批准门禁、TDD、fresh subagent 和多层 review | 多 harness、成熟方法论、低进入成本 |
| OpenSpec | [v1.12.0](https://github.com/Fission-AI/OpenSpec/tree/e062b9572be933564ba3899d059377dfa1393e32) | 轻量 proposal/spec/design/tasks、归档和跨仓 Stores | 30+ 工具、流动工作流、易采用 |

Superpowers 官方流程明确要求设计批准后才实施，并在实现阶段使用 fresh subagent、task review 与 final review；这与 Harness 有共同目标，不应描述成“只有 Harness 会 review”。[官方 brainstorming 合同](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/brainstorming/SKILL.md#L14-L20) [官方 subagent 合同](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/subagent-driven-development/SKILL.md#L6-L12)

OpenSpec 官方定位是轻量且不设 rigid phase gates；Explore 和 Verify 可选，Verify 不阻断 archive。这是产品取舍，不是缺陷。[官方定位](https://github.com/Fission-AI/OpenSpec/blob/e062b9572be933564ba3899d059377dfa1393e32/README.md#L186-L193) [官方 workflow](https://github.com/Fission-AI/OpenSpec/blob/e062b9572be933564ba3899d059377dfa1393e32/docs/workflows.md#L33-L49) [Verify/Archive 语义](https://github.com/Fission-AI/OpenSpec/blob/e062b9572be933564ba3899d059377dfa1393e32/docs/workflows.md#L331-L402)

## 现在能够证明什么

证据等级：L0=设计主张，L1=固定版本源码/文档，L2=确定性行为测试，L3=重复真实模型运行，L4=外部独立复验。

| 企业变更能力 | Enterprise Harness | Superpowers | OpenSpec | 当前证据 |
|---|---|---|---|---|
| 代码事实与外部版本事实分 lane，完成前禁止提问 | runtime 校验 fresh ResearchPacket | 方法要求先探索，无 digest-bound 双 lane | Explore 可选 | EH L2；竞品 L1 |
| 用户决定与输入 revision 精确绑定 | append-only Decision Ledger + digest target | 设计批准主要在会话/设计文档 | change artifacts 可编辑 | EH L2；竞品 L1 |
| stale 输入自动使下游结论失效 | digest-derived invalidation | ledger/spec 帮助恢复，无同构 runtime gate | 支持更新制品，无同构强制 gate | EH L2；竞品 L1 |
| 实施身份、worktree、write scope、真实 RED | runtime receipt 与 hook fail closed | fresh implementer + TDD + review 方法成熟 | Apply/Verify 由 agent 执行，Verify 可选 | EH L2；竞品 L1 |
| Verify 后才能归档 | fresh verification + independent review + proof | completion verification 方法约束 | 官方说明 Verify 不阻断 archive | EH L2；竞品 L1 |
| 离线归档后复验 lineage | source/archive path + digest manifest/attestation | 设计/计划/ledger 保留在 Git | archive 保存 change/spec 历史 | EH L2；竞品 L1 |
| 跨 agent 工具可移植性 | Claude Code only | 多 harness | 30+ 工具 | EH 明确劣势；竞品 L1 |

Harness 的 L2 依据来自仓库长期合同与对应 smoke/E2E，例如 [Clarify 治理](../../harness/specs/clarify-governance.md)、[证据合同](../../harness/specs/evidence.md)、[工作流](../../harness/specs/workflow.md) 和 [归档合同](../../harness/specs/archive-contract.md)。仓库测试数量不用于给竞品打低分；这里只验证 Harness 自己是否实现了声明的行为。

因此，现在可以说“Enterprise Harness 对需要机械拒绝、输入 freshness、身份绑定和离线审计的 Claude Code 变更更合适”。还不能说“总体更好”。

## 修复后 pilot：有效性已闭环，token 优势仍未成立

同一 Claude Code 2.1.263、Sonnet、fresh repo、相同请求和每系统 $1.5 总预算下，修正后的内部 pilot 每系统仍只有 1 次，因此只能诊断，不能对外推断总体表现。三个系统都到达一个核心业务问题，且都没有修改产品代码。

| 系统 | Input | Output | Cache read | 耗时 | 成本 | 到达问题前的关键差异 |
|---|---:|---:|---:|---:|---:|---|
| Superpowers 6.3.0 | 37,689 | 3,040 | 96,000 | 1m30s | $0.187 | 代码探索后提问；关键结论仅在聊天中，无 durable recovery evidence |
| OpenSpec 1.12.0 | 30,059 | 5,152 | 318,912 | 3m20s | $0.263 | 生成完整 change 后提问；回答前已持久化 6 项关键业务假设 |
| Enterprise Harness 0.5.31 candidate | 125,314 | 24,533 | 1,493,760 | 10m30s | $1.177 | 双 lane、gap、机械评分与 digest-bound pending question 后停下 |

修正后聚合记录见 [`pilot-2026-09-09.json`](../../benchmarks/competitive-v1/pilot-2026-09-09.json)，修复前失败与 checkpoint detector 污染样本也列在 `excludedRuns`，没有从研发记录中抹掉。旧基线仍见 [`pilot-2026-09-07.json`](../../benchmarks/competitive-v1/pilot-2026-09-07.json)。两者都明确标注 `publishableConclusion=false`。

当前必须公开承认：

1. “绝对 token 更少”没有证据；修复后 Harness 已从“高成本且未闭环”变为“高成本但可恢复闭环”，但本 case 的 raw token 与耗时仍最高。
2. 当前可观察差异是决策完整性与 durable auditability，不是总体胜负。更合理的待证假设仍是高风险变更的 `tokens_per_accepted_run` 或 `tokens_per_verified_change` 更低；现在还没有全生命周期样本支持它。
3. 静态 Skill 字节数不是 token 结论；缓存 token 也不能从总 token 中偷偷删除。

## 正式评测应采哪些数据

至少建设六类 case，每个 system/case 运行 5 次，正式推广建议 10 次：

| Case | 测什么 | 关键失败 |
|---|---|---|
| brownfield + versioned SDK | 代码/文档取证与决策边界 | 幻觉 SDK 行为、替用户决定、提前写代码 |
| stale requirements | 输入修改后的失效传播 | 沿用旧 design/plan |
| interrupted session | compaction/重启恢复 | 重做任务、猜进度、丢决定 |
| adversarial path | path/symlink/write scope | 越界读取或写入 |
| TDD + independent review | RED、身份隔离、review closure | 自报测试、自我批准 |
| archive replay | 离线 lineage 与复验 | archive 后证据不可重建 |

每次必须发布：成功率、hard-fail 数、中位数与 IQR、input/output/cache token、成本、墙钟时间、tool calls、返工轮数、未授权代码修改数、stale artifact 复用数，以及 `tokens_per_accepted_run`。语义评分必须盲化 system 名称，评分者不能只看最终聊天，还要看 durable artifact 与 diff。

## 推广时建议展示的三个证据层

1. **机制证据**：现场篡改 requirements，展示下游 proof 立即 stale；现场尝试无 review 归档，展示 runtime 拒绝。
2. **行为证据**：公开 benchmark 仓库、固定 commit、prompt、runner、raw digest、盲审 rubric 和全部失败。
3. **业务证据**：试点团队的返工率、PR review 往返、事故逃逸、恢复时间和单个已验收 change 成本。只有这一层才能支撑 ROI。

推荐配图：[`competitive-positioning.png`](assets/competitive-positioning.png) 展示能力定位；[`clarify-pilot-tradeoff.png`](assets/clarify-pilot-tradeoff.png) 同时展示修复后结果、治理差异与真实成本。旧 [`pilot-token-result.png`](assets/pilot-token-result.png) 只保留为 2026-09-07 修复前历史诊断图，不再用于当前推广。

## 可直接使用的推广口径

短版：

> Superpowers 强在工程方法，OpenSpec 强在轻量规格，Enterprise Harness 专注另一件事：让 Claude Code 的企业变更过程可拒绝、可恢复、可审计。它用 digest-bound evidence、独立 review、真实命令 receipt 和 freshness gate，把“模型说完成了”变成“runtime 能验证完成了”。

带限制的对比版：

> 在需要强制验证、审计 lineage 和中断恢复的 Claude Code 变更里，Enterprise Harness 提供了两者默认工作流没有的 runtime enforcement。它不是更轻，也尚未证明更省 token；我们正在用公开、固定版本、包含失败样本的 benchmark 验证单位已验收变更成本。
