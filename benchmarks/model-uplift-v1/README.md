# Model Uplift Benchmark v1

本基准检验一个可证伪的产品假设：

> 在相同软件变更上，弱模型路由 + Enterprise Harness 的产品效果不劣于强模型裸工作流 5 个百分点；在取得 provider 真实账单后，再独立检验每个已验收变更的实际成本是否更低。

它不是用 Harness 产物数量给 Harness 打分。产品效果由系统不可见的隐藏业务测试决定；企业治理产物单独报告。

## 三个实验臂

| 实验臂 | 作用 |
|---|---|
| `weak-harness` | GLM-5.1 controller；插件声明的 Sonnet workers 经 CC Switch 映射为 GLM-5.2；Harness 提供取证、隔离、评审和验证结构 |
| `weak-bare` | 裸 GLM-5.1 因果对照：识别提升来自模型本身还是 Harness |
| `strong-bare` | 裸 GLM-5.2 强模型基线 |

Claude Code alias 是 CC Switch 的路由入口：当前 profile 明确规定 `Haiku/Fable → GLM-5.1`、`Sonnet/Opus → GLM-5.2`。该映射必须由 CC Switch 已启用的本地路由/代理接管实现；benchmark 不覆盖 Base URL、认证或模型环境来伪造通过。原始结果同时记录 assistant `message.model` 与最终 `modelUsage` billing key；Harness 臂不是“纯 GLM-5.1”，而是 GLM-5.1 controller 与 GLM-5.2 专项 workers 的组合。

Claude Code 返回的 `costUSD` 仍基于 Claude billing key，不能代表 CC Switch 上游的 GLM 实际费用。效果证据和经济证据因此分开发布：隐藏验收只要求身份与运行完整；`cost_per_accepted_change` 必须使用 provider 账单或可审计的 provider 价格 receipt。[`pricing.json`](pricing.json) 明确记录当前成本证据缺口。

## 效果与经济学

主指标是系统中立的隐藏验收。当前 case 覆盖订单取消的状态、原子性与并发幂等，Webhook 的 HMAC 签名、时间窗、多签名轮换、负载校验和重放防护，以及订阅变更的乐观锁、外部失败原子性、幂等冲突和 forward/rollback SQL migration。`accepted` 要求当前 case 的全部关键测试通过、公开回归测试通过且未篡改需求。

经济指标：

```text
effect_uplift 可发布 = identity-valid paired observations >= 10
                       AND bootstrap_95%_lower(mean effect gap) >= -5pp

economic_advantage 可发布 = provider-billed cost complete
                            AND bootstrap_95%_upper(cost_per_accepted_change ratio) < 1
```

效果结论至少需要 10 个按 case/repetition 配对且模型身份有效的观测，并通过固定种子、10,000 次配对 bootstrap 的非劣置信边界。成本结论额外要求每个样本具备 provider-billed cost；Claude alias 估值不合格。`n=1` 只能发现 runner、预算和任务难度问题。

当前证据状态由 [`evidence-status.json`](evidence-status.json) 机械声明。早期诊断中的 Haiku/Opus 是 CC Switch alias，不应解释为 Anthropic 模型；[`pilot-2026-09-10.json`](pilot-2026-09-10.json) 保留了这项口径修正。现有单样本只验证 runner/case，尚不能发布 GLM-5.1 与 GLM-5.2 的效果结论。

## 运行

```bash
node benchmarks/model-uplift-v1/preflight.mjs --output /tmp/model-uplift-preflight.json
node benchmarks/model-uplift-v1/run.mjs --case all --reps 1 --budget-usd 3 --max-agent-turns 60 --invocation-timeout-ms 900000 --preflight-receipt /tmp/model-uplift-preflight.json
node benchmarks/model-uplift-v1/summarize.mjs <results>/raw-results.json <results>/summary.json
```

正式 `--case all` 在花费完整生命周期预算前强制读取 24 小时内的 preflight receipt。预检验证 Haiku/Sonnet/Opus alias 是否分别解析到 profile 声明的 GLM-5.1/GLM-5.2，并绑定 Claude Code 版本和非 secret 路由配置摘要；失败时停止，不允许用 `--force` 绕过。单 case 仍可用于 diagnostic runner 调试。

只运行一个实验臂：

```bash
node benchmarks/model-uplift-v1/run.mjs --arm weak-harness --reps 1 --budget-usd 3
```

runner 使用 fresh git repository、相同不可变业务规格和相同隐藏 grader。接口形状、错误语义和可观察结果必须先写入公开给模型的规格，隐藏 grader 不得添加未声明的实现偏好。Harness 实验臂的首条用户消息同时内嵌完整规格，runner 还会验证 `requirements.md` 逐字绑定了该 raw request；只让模型“另行读取规格文件”不算同输入。Harness 必须走真实插件入口；裸实验臂不加载项目或用户设置。Harness 每轮前后读取 durable workflow status，以 exact `stage/status/nextAction/pendingDecision` 驱动下一轮；同阶段恢复原会话，跨阶段创建新会话以减少上下文污染，连续两轮无状态进展则停止。stdout 同步写入 `results/**/streams/`；超时仍保留部分事件，但没有最终 billing result、模型身份冲突或 raw request 未绑定的样本都标记为 `measurementValid=false`，成本不得按 $0 汇总。原始失败、无状态进展、未归档和预算耗尽都保留在结果中，不能从汇总中删除。
