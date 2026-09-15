# Model Uplift Benchmark v1

本基准检验一个可证伪的产品假设：

> 在相同业务问题上，全程使用 GLM-5.1 的 Harness 能提高弱模型效果，并达到裸 GLM-5.2 工作流的效果。

它不是用 Harness 产物数量给 Harness 打分。产品效果由系统不可见的隐藏业务测试决定；企业治理产物单独报告。

## 三个实验臂

| 实验臂 | 作用 |
|---|---|
| `weak-bare` | 裸 GLM-5.1 基线 |
| `weak-harness` | controller 与 subagent 都锁定 GLM-5.1，隔离 Harness 自身的流程增益 |
| `strong-bare` | 裸工作流、GLM-5.2 controller 强模型基线 |

Claude Code alias 是 CC Switch 的路由入口：当前 profile 明确规定 `Haiku/Fable → GLM-5.1`、`Sonnet/Opus → GLM-5.2`。该映射必须由 CC Switch 已启用的本地路由/代理接管实现；benchmark 不覆盖 Base URL、认证或模型环境来伪造通过。assistant `message.model` 与 Claude billing alias 用于预检，正式样本再由 CC Switch proxy log 的 session、实际 model 与 invocation 时间窗证明档位身份。插件所有 named agent 都使用 `model: inherit`。`weak-harness` 还按 Claude Code 官方的 [subagent model 规则](https://code.claude.com/docs/en/sub-agents#run-every-subagent-on-one-model)，同时设置 `CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5` 与 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`，防止普通 subagent、teammate 或 workflow agent 自行升级；fork 与 `model: inherit` Skill 仍跟随 Haiku controller。任何实际 GLM-5.2 请求仍由 route receipt 判定为污染样本。

效果证据与资源统计分开：隐藏验收决定业务效果；CC Switch proxy log 通过 Claude session ID、invocation 时间窗和实际 `model` 证明每条样本的产品档位，并按用户确认的中转站规则累计请求计费单位。GLM-5.1 每次请求记 1 单位，GLM-5.2 每次请求记 3 单位。Claude Code 返回的 alias `costUSD` 仅保留作诊断；计费单位、token 和耗时都不参与效果发布门槛。

`export-cc-switch-route-receipt.py` 从只读 SQLite 生成路由证据，`attach-route-receipt.mjs` 校验完整样本覆盖、session、请求 ID 与时间窗，写入 `modelTierIdentityValid`、`routeProblems`、逐模型请求数和 `relayChargeUnits`。模型不符不会抹掉资源统计：样本保留但 `modelTierIdentityValid=false`，因此不能进入效果结论。时间关联允许 2 分钟时钟偏差。[`pricing.json`](pricing.json) 是 1:3 固定计次规则的版本化权威。provider receipt 工具仍保留给其他按真实金额结算的环境，但不是本轮模型效果主张的输入或门槛。

Claude Code 可能在指定 Sonnet controller 时额外调用 Haiku 做内部辅助。route receipt 必须完整记录这些请求：两个弱臂只允许实际 GLM-5.1，出现任何 GLM-5.2 即判污染；`strong-bare` 允许 GLM-5.1/5.2，全部请求分别按 1/3 单位计入。因此“强模型”指 GLM-5.2 controller 档位，不声称进程中的每个内部请求都是 GLM-5.2。

## 先评业务问题，再评代码

[`business-evaluation.json`](business-evaluation.json) 冻结了正式数据采集前的评测协议。第一轨不是给模型完整规格后看它会不会写代码，而是提供故意不完整的真实业务请求，让各实验臂在相同代码、外部文档快照和脚本化用户回答下发现关键未知项。主指标是关键未知项召回、未经确认的假设、证据落地、每轮解决的关键决定以及澄清结果能否验收。

第二轨才使用澄清后的冻结需求做隐藏业务验收；第三轨在执行中修改需求并中断会话，检查旧证据失效和恢复准确性。这样可以区分“会做题”与“会把模糊业务问题梳理成正确交付”。至少 5 个不同 holdout case、每项比较至少 20 对有效观测后才允许发布正式产品效果；仓库内开发 case 和当前生命周期 runner 固定为诊断输入，不能混入公开结论。

仓库内的 [`business-cases.development.json`](business-cases.development.json) 提供退款、支付回调、订阅降级、客户数据导出和库存预留 5 个开发 case。`business-run.mjs` 在 fresh repository 中运行真实 Claude Code 会话，捕获 `AskUserQuestion` 或最终文本问题；脚本化用户只返回问题命中的隐藏事实。评分器计算关键未知项召回、最终需求覆盖、未询问却写入的假设、证据路径落地、提问效率和提前修改产品代码。开发 case 固定 `publishable=false`，即使重复运行达到样本门也不能生成公开结论。

Claude Code headless `-p` 不提供交互式 `AskUserQuestion` UI。Harness 臂检测到模型已经通过 `prepare-question` 生成的唯一 canonical candidate 后，由 runner 充当测试用户：逐字构造该 candidate 的 tool input，依次执行真实 pre-question/post-question hook，并从脚本化隐藏真值选择业务选项。若候选选项不包含正确业务答案，则提交自由文本并由 runtime 记录 `other`，不能为让流程通过而选错答案。拓扑等非业务治理确认只接受 candidate 已授权的推荐项；每次桥接的 questionId、decisionType 与 selectedOptionId 都写入 invocation evidence。

正式 holdout 必须通过仓库外的 case pack 提供，并声明 `split=holdout`、`publishable=true`；runner 会记录 pack digest，拒绝把仓库内题库伪装成 holdout。由于真实 Claude Code 使用 `bypassPermissions`，外部路径本身不构成保密边界：本地正式运行要求把 case pack 单独放在 `/var/tmp` 下并传入 `--holdout-isolation bwrap`。runner 使用 bubblewrap 对 Claude 子进程遮蔽整个 `/var/tmp`，并自动生成 digest-bound isolation receipt；不接受手工声明本地隔离。当前实现限 Linux/bwrap，其他平台需未来接入远程盲评器。

## 效果、资源与经济学

主指标是系统中立的隐藏验收。当前 case 覆盖订单取消的状态、原子性与并发幂等，Webhook 的 HMAC 签名、时间窗、多签名轮换、负载校验和重放防护，以及订阅变更的乐观锁、外部失败原子性、幂等冲突和 forward/rollback SQL migration。`accepted` 要求当前 case 的全部关键测试通过、公开回归测试通过且未篡改需求。

效果判定：

```text
weak_workflow_uplift 可发布 = identity-valid paired observations >= 20
                            AND distinct holdout cases >= 5
                            AND bootstrap_95%_lower(mean effect gap) > 0pp

weak_model_substitution 可发布 = identity-valid paired observations >= 20
                              AND distinct holdout cases >= 5
                              AND bootstrap_95%_lower(mean effect gap) >= -5pp
```

runner 在 10 对按 case/repetition 配对且模型身份有效的观测后提供诊断置信区间，但不会发布结论；正式业务报告采用至少 20 对、至少 5 个不同 holdout case，并通过固定种子、10,000 次配对 bootstrap。两项效果门必须同时通过，才能表述“弱模型经 Harness 提升并比肩强模型”。`n=1` 只能发现 runner、预算和任务难度问题。

两个假设分别报告：弱 Harness 对弱裸的严格正向流程增益，以及弱 Harness 对强裸的 5pp 非劣。token、请求次数、1:3 中转计费单位、耗时和工具调用只用于解释资源投入，不参与业务效果判定；“强模型使用 Harness 会更好”不在本轮主张范围内。

当前证据状态由 [`evidence-status.json`](evidence-status.json) 机械声明。早期诊断中的 Haiku/Opus 是 CC Switch alias，不应解释为 Anthropic 模型；[`pilot-2026-09-10.json`](pilot-2026-09-10.json) 保留了这项口径修正。2026-09-14 的 [fresh preflight](preflight-2026-09-14.json) 已验证 Haiku→GLM-5.1、Sonnet→GLM-5.2 同窗可用；[真实 bwrap 探针](holdout-isolation-smoke-2026-09-14.json) 证明 Claude 看不到指定 holdout 路径但仍能读取公开 evidence 并提问。两者只证明采样环境就绪，尚不能发布效果结论。

[Holdout v1 manifest](holdout-v1-manifest.json) 已在正式数据产生前冻结 5 个外部 case、36 个关键未知项及 case pack digest；manifest 不含隐藏答案。任何 pack 修改都会改变 digest，并使既有 isolation/result receipt 无法匹配。

## 运行

```bash
node benchmarks/model-uplift-v1/preflight.mjs --output /tmp/model-uplift-preflight.json
node benchmarks/model-uplift-v1/business-run.mjs --case all --case-pack /var/tmp/enterprise-harness-holdouts/v1/cases.json --holdout-isolation bwrap --reps 1 --invocation-timeout-ms 1800000 --preflight-receipt /tmp/model-uplift-preflight.json
node benchmarks/model-uplift-v1/run.mjs --case all --reps 1 --budget-usd 3 --max-agent-turns 60 --invocation-timeout-ms 900000 --preflight-receipt /tmp/model-uplift-preflight.json
python3 benchmarks/model-uplift-v1/export-cc-switch-route-receipt.py <business-results.json> ~/.cc-switch/cc-switch.db <route-receipt.json>
node benchmarks/model-uplift-v1/attach-route-receipt.mjs <business-results.json> <route-receipt.json> <route-reconciled.json>
node benchmarks/model-uplift-v1/summarize.mjs <route-reconciled.json> <summary.json>
```

正式 `--case all` 在花费完整生命周期预算前强制读取 24 小时内的 preflight receipt。预检验证选中实验臂使用的 Haiku/Sonnet alias 是否分别可用且 billing alias 与 profile 一致，并绑定 Claude Code 版本和非 secret 路由配置摘要；实际产品档位最终由 CC Switch 路由回执闭环。失败时停止，不允许用 `--force` 绕过。单 case 仍可用于 diagnostic runner 调试；holdout 还会拒绝 dirty worktree，避免回执绑定到不能复现的 runner。

业务澄清 runner 在 `results/.../checkpoints/` 中为每个实验臂原子写入上一完整轮的 transcript、模型观测和 token 使用；进程中断后可以定位最后完成位置。checkpoint 是审计证据，不替代最终结果、隔离回执或 CC Switch route receipt。

只运行一个实验臂：

```bash
node benchmarks/model-uplift-v1/run.mjs --arm weak-harness --reps 1 --budget-usd 3
```

runner 使用 fresh git repository、相同不可变业务规格和相同隐藏 grader。接口形状、错误语义和可观察结果必须先写入公开给模型的规格，隐藏 grader 不得添加未声明的实现偏好。Harness 实验臂的首条用户消息同时内嵌完整规格，runner 还会验证 `requirements.md` 逐字绑定了该 raw request；只让模型“另行读取规格文件”不算同输入。Harness 必须走真实插件入口；裸实验臂不加载项目或用户设置。Harness 每轮前后读取 durable workflow status，以 exact `stage/status/nextAction/pendingDecision` 驱动下一轮；同阶段恢复原会话，跨阶段创建新会话以减少上下文污染，连续两轮无状态进展则停止。stdout 同步写入 `results/**/streams/`；超时仍保留部分事件，但没有最终 billing result、模型身份冲突或 raw request 未绑定的样本都标记为 `measurementValid=false`，成本不得按 $0 汇总。原始失败、无状态进展、未归档和预算耗尽都保留在结果中，不能从汇总中删除。
