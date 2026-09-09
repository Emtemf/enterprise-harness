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

模型 alias 由 Claude Code 解析，原始结果记录 `modelUsage` 返回的每个真实模型 ID 和 `costUSD`，不能把整个 Harness 实验臂错误标成“纯 Haiku”。截至 2026-09-09，Anthropic 公布的 Haiku 4.5 输入/输出/缓存读取价格为 $1/$5/$0.10 每百万 token，Sonnet 5 为 $2/$10/$0.20，Opus 5 为 $5/$25/$0.50；[`pricing.json`](pricing.json) 固定本轮解释口径，正式成本仍以实际账单字段为准。

## 效果与经济学

主指标是系统中立的隐藏验收：未知订单、非 PENDING、退款成功、退款失败原子性、串行幂等、并发幂等和不同 requestId 冲突。`accepted` 要求全部关键测试通过、公开回归测试通过且未篡改需求。

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
node benchmarks/model-uplift-v1/run.mjs --reps 1 --budget-usd 3
node benchmarks/model-uplift-v1/summarize.mjs <results>/raw-results.json <results>/summary.json
```

只运行一个实验臂：

```bash
node benchmarks/model-uplift-v1/run.mjs --arm haiku-harness --reps 1 --budget-usd 3
```

runner 使用 fresh git repository、相同不可变业务规格和相同隐藏 grader。接口形状、错误语义和可观察结果必须先写入公开给模型的规格，隐藏 grader 不得添加未声明的实现偏好。Harness 实验臂必须走真实插件入口；裸实验臂不加载项目或用户设置。三组都使用最多 20 agent turns 的短调用并通过 session resume 继续，stdout 同步写入 `results/**/streams/`；超时仍保留部分事件，但没有最终 billing result 的样本标记为 `measurementValid=false`，成本不得按 $0 汇总。原始失败、未归档和预算耗尽都保留在结果中，不能从汇总中删除。
