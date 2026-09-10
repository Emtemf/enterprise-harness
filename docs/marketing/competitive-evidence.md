# Enterprise Harness：把 AI 编码变成可验收的企业交付

企业采用 AI 编码，真正关心的不是一次回答用了多少 token，而是最终交付是否正确、能否复验、出现中断后能否恢复，以及错误状态会不会被当成已经完成。

Enterprise Harness 是面向 Claude Code 的 acceptance control plane。它把取证、用户决策、架构与测试设计、任务拆分、隔离实施、独立评审、验证和归档连接成一条可执行的交付协议。缺少新鲜证据、越权写入、自我批准或无法复验时，runtime 会拒绝进入下一个已验收状态。

![较低成本模型通过证据、审查和验证轨道形成可验收交付](assets/model-uplift-hero.png)

我们要验证的核心命题不是“流程越多越好”，而是：能否用较低成本的模型路由，在 Harness 的事实取证、上下文隔离、独立审查和可执行验证约束下，达到高价模型的产品效果，同时降低单位合格交付成本。

## 企业最终得到什么

一次受治理的变更不只留下聊天记录，而会形成可追踪的交付物：

| 阶段 | 关键产物 | 企业价值 |
|---|---|---|
| Clarify | 代码与外部文档研究证据、需求、用户决定、歧义结果 | 事实与选择分开，避免模型替用户决定 |
| Design | 架构设计、API/SQL/交互边界、独立测试用例、双重评审证据 | 在写代码前发现设计和验收缺口 |
| Plan | 可独立执行的任务、命令、写入范围和回滚动作 | 计划能够被另一名 agent 接手和验证 |
| Implement | 隔离 worktree、真实 RED/GREEN/REFACTOR receipt、独立 review | “运行过测试”由命令证据证明，而不是由模型自报 |
| Verify | 面向需求和测试用例的新鲜验证、独立完成审查 | 验证基于最终代码与最终输入，不复用过期结论 |
| Archive | digest、identity、receipt 和 lineage | 离开聊天上下文后仍可重建变更为何被接受 |

这让团队能够回答几个通常很难回答的问题：这段代码依据的是哪一版需求？关键业务选择由谁确认？测试是否真实执行？评审是否独立？输入变化后哪些结论已经失效？

## 为什么值得投入更多计算

Enterprise Harness 不以“首轮回答最便宜”为目标。额外计算用于代码与文档取证、上下文隔离、独立审查、freshness 校验和失败后的恢复。对于错误需求进入主干、跨会话丢失决定或审计证据不足会造成高额返工的团队，这些投入购买的是更高质量的已验收产出。

因此，评估时应把交付效果作为首要指标：

- 已验收结果是否满足真实业务需求；
- stale、越权、自我批准和缺证据状态是否会被拒绝；
- 需求变化或会话中断后是否能准确恢复；
- 设计、代码、测试与最终归档是否形成完整 lineage；
- 独立人员能否复验结论。

token 只作为资源指标，与耗时和工具调用量一起观察；它不替代正确率、返工率、缺陷逃逸率、恢复时间和可审计产出。

## Token 经济学：计算单位合格交付，而不是单次回答

便宜模型可以使用更多 token，只要它最终产生同等质量的已验收结果，并且总成本仍更低。评估公式是：

```text
单位合格交付成本 = 所有成功与失败运行的实际模型费用总和 / 已验收变更数

Harness 模型路由成本 = GLM-5.1 controller 成本
                      + GLM-5.2 专项 worker 成本
                      + cache 与工具成本
```

当前 CC Switch 评测把 Haiku/Fable 路由到 GLM-5.1，把 Sonnet/Opus 路由到 GLM-5.2。因此 Harness 实验臂不是“全程弱模型”：主 controller 是 GLM-5.1，代码探索、设计、实施和评审等专项 agent 是 GLM-5.2；强模型基线是裸 GLM-5.2。

效果与成本使用两道独立证据门：

1. 在相同隐藏业务验收上，Harness 组合相对裸 GLM-5.2 的效果均值差，其配对 bootstrap 95% 置信区间下界不低于 -5 个百分点；
2. 取得 GLM provider 真实账单后，`cost_per_accepted_change` 比值的 95% 置信区间上界小于 1。

仓库已经提供可复现的 [Model Uplift Benchmark](../../benchmarks/model-uplift-v1/README.md)，包含 GLM-5.1 controller + GLM-5.2 workers + Harness、裸 GLM-5.1、裸 GLM-5.2 三个实验臂。模型放大效果目前尚未完成可发布验证：公开效果结论等待多类 case、至少 10 对身份有效观测通过效果置信边界；经济结论还必须取得 provider 真实费用。Claude Code 按 Claude alias 返回的 `costUSD` 只保留为诊断估值，不冒充 GLM 实际账单。

## 与 Superpowers、OpenSpec 的区别

三者解决的是不同层次的问题，而不是简单的功能多少：

| 方案 | 核心价值 | 更适合 |
|---|---|---|
| [Superpowers v6.3.0](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797) | 成熟的 brainstorming、TDD、subagent 和 review 工程方法 | 希望以较低流程成本提升 agent 工程纪律，并需要多 harness 支持的团队 |
| [OpenSpec v1.12.0](https://github.com/Fission-AI/OpenSpec/tree/e062b9572be933564ba3899d059377dfa1393e32) | 轻量、流动、跨工具的 proposal/spec/design/tasks 资产 | 希望快速引入规格化协作且不需要强制阶段门禁的团队 |
| Enterprise Harness | Claude Code runtime 可重新计算并拒绝的验收条件，以及跨会话证据链 | 不能把“模型说完成了”直接当成交付证据的团队 |

Superpowers 已具备设计批准、fresh subagent、TDD 和多层 review；OpenSpec 刻意采用轻量、非刚性的工作流。Enterprise Harness 的差异不在于声称只有自己会设计或评审，而在于把 freshness、identity、receipt、write scope 和 lineage 变成 runtime acceptance predicate。

## 已经能够复验的证据

仓库提供确定性失效注入基线，用真实 runtime 检查以下状态能否被错误接受：

- stale 的待确认问题；
- 输入变化后仍复用旧 Clarify 产物；
- 测试设计变化后仍复用旧 Plan；
- 超出批准 write scope 的写入；
- 只有 review、没有 CompletionProof 的归档。

当前基线中，5/5 类无效状态均被拒绝，1/1 条带完整 lineage 的有效生命周期通过。它证明机械门禁确实工作，不代表所有项目的业务 ROI 已经被证明。可直接查看 [governance-v1 场景、命令与结果](../../benchmarks/governance-v1/README.md)。

真实 Claude Code 安装态验证还覆盖打包插件的 Clarify、复合 Design、Plan、TDD Implement、Verify 和 Archive，确保验证对象是用户实际安装的资产，而不只是源码测试。

## 适用边界

Enterprise Harness 更适合高风险、长链路、多人接力或需要审计的软件变更。以下场景通常不需要这套重量：

- 一次性原型、探索性脚本或可随时丢弃的代码；
- 团队只需要轻量 spec 或工程方法提示；
- 必须跨多种 coding agent 使用同一工作流；
- 尚未准备好为强制验证和证据留存投入额外时间。

当前产品只面向 Claude Code，也不替代企业已有的 CI、代码所有者审批、安全扫描或合规平台；它负责的是 agent 从需求到归档这一段交付过程的可验收性。

## 用一个真实变更评估

选择一个包含现有代码、版本化外部依赖和至少一个关键业务歧义的真实变更。在过程中主动修改一次需求、中断一次会话，并尝试缺少独立 review 或验证证据的推进。比较最终得到的结果，而不只比较第一轮回答：

1. 有多少业务假设未经用户确认就进入了设计或代码；
2. 输入变化后是否仍复用了旧结论；
3. 中断后恢复用了多久，是否重复或漏做工作；
4. 无效状态是否能够进入“已完成”；
5. 第三方能否从持久化产物复验整个交付。

原始 token、耗时与失败样本保留在 [competitive-v1 数据集](../../benchmarks/competitive-v1/)，用于成本诊断。现阶段它们不支持“绝对更省 token”的结论；Enterprise Harness 的可验证优势是让缺少交付证据的工作不能被验收。
