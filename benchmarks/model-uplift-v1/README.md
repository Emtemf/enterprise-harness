# Model Uplift Benchmark v1

本基准检验一个可证伪的产品假设：

> 在相同软件变更上，低价模型 + Enterprise Harness 的产品效果不劣于高价模型裸工作流 5 个百分点，并且每个已验收变更的实际模型成本更低。

它不是用 Harness 产物数量给 Harness 打分。产品效果由系统不可见的隐藏业务测试决定；企业治理产物单独报告。

## 三个实验臂

| 实验臂 | 作用 |
|---|---|
| `haiku-harness` | 待验证的模型路由：Haiku controller，插件声明的 Sonnet 专项 workers，Harness 提供取证、隔离、评审和验证结构 |
| `haiku-bare` | 因果对照：识别提升来自模型本身还是 Harness |
| `opus-bare` | 高价模型基线：检验低价组合能否达到强模型产品效果 |

模型 alias 由 Claude Code 或兼容 provider 解析，原始结果同时记录 assistant 事件的 `message.model`、最终 `modelUsage` 的模型 ID 和 `costUSD`。两类模型身份必须与实验臂预期 family 一致，否则即使账单完整也标记为 `modelIdentityValid=false`，不能进入公开模型对比。不能把整个 Harness 实验臂错误标成“纯 Haiku”。截至 2026-09-09，Anthropic 公布的 Haiku 4.5 输入/输出/缓存读取价格为 $1/$5/$0.10 每百万 token，Sonnet 5 为 $2/$10/$0.20，Opus 5 为 $5/$25/$0.50；[`pricing.json`](pricing.json) 只适用于身份一致的 Anthropic 模型运行，正式成本仍以实际账单字段为准。

## 效果与经济学

主指标是系统中立的隐藏验收。当前 case 覆盖订单取消的状态、原子性与并发幂等，Webhook 的 HMAC 签名、时间窗、多签名轮换、负载校验和重放防护，以及订阅变更的乐观锁、外部失败原子性、幂等冲突和 forward/rollback SQL migration。`accepted` 要求当前 case 的全部关键测试通过、公开回归测试通过且未篡改需求。

经济指标：

```text
cost_per_accepted_change = 全部运行实际 costUSD / accepted runs
model_uplift 可发布 = paired observations >= 10
                      AND bootstrap_95%_lower(mean effect gap) >= -5pp
                      AND bootstrap_95%_upper(cost_per_accepted_change ratio) < 1
```

正式结论至少需要 10 个按 case/repetition 配对的观测，并通过固定种子、10,000 次配对 bootstrap 的效果非劣与成本优势置信边界；`n=1` 只能发现 runner、预算和任务难度问题。后续应扩展到 API/SQL migration、多服务契约、安全修复、中断恢复和浏览器 E2E，而不是在一个 case 上重复到看似显著。

当前证据状态由 [`evidence-status.json`](evidence-status.json) 机械声明。2026-09-09 的首轮诊断见 [`pilot-2026-09-09.json`](pilot-2026-09-09.json)：校准 grader 后，裸 Haiku 与裸 Opus 在简单 case 上均为 7/7，Haiku 成本为 Opus 的 25.2%；这说明 case 缺少模型区分度，不能证明 Harness 增益。Harness 臂因 runner 超时且缺最终 billing result 无法计算经济性。

## 运行

```bash
node benchmarks/model-uplift-v1/run.mjs --case all --reps 1 --budget-usd 3 --max-agent-turns 60 --invocation-timeout-ms 900000
node benchmarks/model-uplift-v1/summarize.mjs <results>/raw-results.json <results>/summary.json
```

只运行一个实验臂：

```bash
node benchmarks/model-uplift-v1/run.mjs --arm haiku-harness --reps 1 --budget-usd 3
```

runner 使用 fresh git repository、相同不可变业务规格和相同隐藏 grader。接口形状、错误语义和可观察结果必须先写入公开给模型的规格，隐藏 grader 不得添加未声明的实现偏好。Harness 实验臂的首条用户消息同时内嵌完整规格，runner 还会验证 `requirements.md` 逐字绑定了该 raw request；只让模型“另行读取规格文件”不算同输入。Harness 必须走真实插件入口；裸实验臂不加载项目或用户设置。Harness 每轮前后读取 durable workflow status，以 exact `stage/status/nextAction/pendingDecision` 驱动下一轮；同阶段恢复原会话，跨阶段创建新会话以减少上下文污染，连续两轮无状态进展则停止。stdout 同步写入 `results/**/streams/`；超时仍保留部分事件，但没有最终 billing result、模型身份冲突或 raw request 未绑定的样本都标记为 `measurementValid=false`，成本不得按 $0 汇总。原始失败、无状态进展、未归档和预算耗尽都保留在结果中，不能从汇总中删除。
