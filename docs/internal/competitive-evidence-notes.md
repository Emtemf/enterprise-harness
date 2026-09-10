# 竞争证据与传播维护说明

更新时间：2026-09-09

本文件只供维护者使用。对外读者入口是 [`docs/marketing/competitive-evidence.md`](../marketing/competitive-evidence.md)；公开页面讲企业结果、交付物、选型边界和已验证事实，不承载宣传审批、实验计划或当前 checkout 诊断。

## 主张边界

当前可以主张：

- Enterprise Harness 为 Claude Code 提供 runtime acceptance predicate；
- stale、越权、自我批准、缺 receipt/lineage 的状态可被机械拒绝；
- 确定性治理基线中 5/5 类无效状态被拒绝，1/1 条完整 lineage 通过；
- 交付效果、恢复能力和可审计产出是目标，token/耗时属于资源指标。

当前不可主张：

- 所有场景总体优于 Superpowers 或 OpenSpec；
- 已证明绝对更省 token 或企业 ROI 更高；
- 使用 Harness 就能消除幻觉、事故或人工审批；
- 支持 Claude Code 之外的 coding agent。

## 固定比较对象

- Superpowers v6.3.0，commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`；
- OpenSpec v1.12.0，commit `e062b9572be933564ba3899d059377dfa1393e32`；
- Enterprise Harness 0.5.31 candidate。

对比必须承认 Superpowers 的设计批准、TDD、fresh subagent 与多层 review，也必须承认 OpenSpec 的轻量、流动、跨工具是有意的产品取舍。差异应落在 Harness 的 digest、identity、receipt、freshness、write scope 和 lineage 是否由 runtime 强制，而不是泛化成“竞品没有企业能力”。

## 2026-09-09 pilot 诊断

环境：Claude Code 2.1.263、Sonnet、fresh repo、相同请求、每系统 1 次、每系统 $1.5 总预算。该样本只用于诊断，不可外推。

| 系统 | Input | Output | Cache read | 耗时 | 成本 | 结果 |
|---|---:|---:|---:|---:|---:|---|
| Superpowers 6.3.0 | 37,689 | 3,040 | 96,000 | 1m30s | $0.187 | 代码探索后到达核心业务问题 |
| OpenSpec 1.12.0 | 30,059 | 5,152 | 318,912 | 3m20s | $0.263 | 生成 change 后到达问题，提前持久化 6 项业务假设 |
| Enterprise Harness 0.5.31 candidate | 125,314 | 24,533 | 1,493,760 | 10m30s | $1.177 | 双 lane、gap、歧义计算与 digest-bound pending question 后停下 |

聚合记录：[`pilot-2026-09-09.json`](../../benchmarks/competitive-v1/pilot-2026-09-09.json)。修复前样本：[`pilot-2026-09-07.json`](../../benchmarks/competitive-v1/pilot-2026-09-07.json)。两者均标记 `publishableConclusion=false`。

这组数据说明当前 Harness 为更完整的取证与恢复证据支付了更高资源成本；它没有证明 token 优势。后续假设应围绕单位已验收变更的效果与成本，而不是首轮 token。

## 2026-09-09 Model uplift runner 诊断

新增 `benchmarks/model-uplift-v1/`。早期以 Claude alias 记为 Haiku controller + Harness、裸 Haiku、裸 Opus；用户随后提供 CC Switch 显式映射，权威评测口径修正为 GLM-5.1 controller + GLM-5.2 workers + Harness、裸 GLM-5.1、裸 GLM-5.2。主指标是系统中立隐藏业务测试；经济指标单独使用 provider-billed `cost_per_accepted_change`。

首轮同步 runner 的原始 grader 错误地强制了需求未声明的异常/返回值与 `auditSink` 方法名，导致两个裸跑 alias 都被误判为 0/7。按用户可观察合同校准后，两者均为 7/7；Claude Code alias costUSD 分别为 $0.1132476 与 $0.448735。该简单 case 没有区分模型效果，而 alias cost 也不能解释为 GLM provider 实际成本。

Harness 实验臂在 Clarify research 中超时，未修改产品代码，且 `claude` 未返回最终 billing result。旧 runner 把缺失 cost 显示为 $0，已改为流式保存事件并标记 `measurementValid=false`；任何不完整账单都阻断公开结论。完整诊断见 [`pilot-2026-09-09.json`](../../benchmarks/model-uplift-v1/pilot-2026-09-09.json)。

2026-09-10 增加 Webhook 安全 case 后，请求 Haiku alias 的裸跑样本通过 7/7，stream 为 `glm-5.1`，最终 `modelUsage` key 为 `claude-haiku-4-5`。结合 CC Switch 配置，这两者分别是实际模型和 billing alias，属于预期路由；样本可进入弱模型效果诊断。其 $0.1052646 只是 Claude alias costUSD，不能进入 GLM 经济结论。诊断见 [`pilot-2026-09-10.json`](../../benchmarks/model-uplift-v1/pilot-2026-09-10.json)。

状态驱动 Harness runner 的后续诊断完成两个独立 code-explore packet、关闭 fact gate，并把 durable revision 从 1 推进到 2，证明旧版固定 6 分钟盲跑并非唯一可行驱动方式。但本轮 `requirements.md` 的原始需求只绑定入口说明，完整业务规格仅存在于附件文件，违反 Harness 自己的“附件是 evidence、不是用户原文”合同。运行因此被主动停止；runner 已改为首条消息内嵌完整规格，并以逐字 `rawRequestBound` 检查阻断同输入不成立的样本。

旧环境预检探测 Haiku、Sonnet、Opus 三个 alias 时，assistant stream 均报告 `glm-5.1`；这符合弱路由，但不符合 CC Switch profile 中 Sonnet/Opus 应为 GLM-5.2 的强路由。三次探针的 Claude alias costUSD 合计 $0.1474236，Sonnet/Opus 同时触发 $0.03 预算上限。该快照保留为错误/过期路由负样本；正式 `--case all` 要求 24 小时内、Claude Code 版本、CC Switch profile 和非 secret 路由摘要一致的 pass receipt，不提供 `--force` 绕过。

用户提供 CC Switch 设置截图后确认目标映射为 Haiku/Fable→GLM-5.1、Sonnet/Opus→GLM-5.2。fresh 预检仍观察到 Haiku alias 指向不可用的 `claude-haiku-4-5`，Sonnet/Opus 的 response model 为 `glm-5.3`；直接把 Claude 默认模型覆盖为 `glm-5.1/5.2` 又返回 `unrecognized_model`。这与 CC Switch 页面“仅在开启本地路由/代理接管后生效”的边界一致：模型名重写必须由 CC Switch 层完成，benchmark 不应伪造环境覆盖。当前正式矩阵继续 fail closed，等待 CC Switch 保存、启用接管并让新进程继承后重跑 preflight。

## 正式评测设计

至少覆盖 brownfield + versioned SDK、stale requirements、interrupted session、adversarial path、TDD + independent review、archive replay 六类 case。模型放大结论至少需要 10 对 measurement-valid 观测，并优先增加有区分度的不同 case，而不是只重复一个简单编码题。

主指标：

- accepted change 的需求正确率与 hard-fail 数；
- 未确认假设、stale artifact 复用、越权修改和缺陷逃逸；
- 中断恢复时间、返工轮数和第三方复验成功率；
- durable artifacts、receipt 和 lineage 完整率。

资源指标：input/output/cache token、成本、墙钟时间、tool calls，以及 `tokens_per_accepted_run` 或 `tokens_per_verified_change`。语义评分必须盲化 system 名称，并同时检查聊天、durable artifacts 与 diff。

## 传播资产维护规则

- `docs/marketing/` 的每一页都假定会被最终用户直接阅读；只写用户价值、能力、证据和边界。
- 宣传审批、禁用主张、样本局限、实验参数和下一轮工作留在本文件与 `benchmarks/`。
- 公开主图呈现“投入什么治理、产出什么交付结果”，不把 n=1 token 图作为优势证明。
- 只有确定性基线可以称为当前已验证机制；企业 ROI 需要外部试点数据。
