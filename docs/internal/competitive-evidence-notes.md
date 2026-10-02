# 竞争证据与传播维护说明

更新时间：2026-09-29

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

新增 `benchmarks/model-uplift-v1/`。早期以 Claude alias 记为 Haiku controller + Harness、裸 Haiku、裸 Opus，随后按 CC Switch 显式映射扩展为五臂探索矩阵。2026-09-14 根据最终推广问题收敛为三臂：裸 GLM-5.1、全 GLM-5.1 Harness、裸 GLM-5.2。主指标是系统中立隐藏业务验收；必须同时证明 Harness 对同一弱模型的因果提升，以及弱 Harness 对强裸的 5pp 非劣。

首轮同步 runner 的原始 grader 错误地强制了需求未声明的异常/返回值与 `auditSink` 方法名，导致两个裸跑 alias 都被误判为 0/7。按用户可观察合同校准后，两者均为 7/7；Claude Code alias costUSD 分别为 $0.1132476 与 $0.448735。该简单 case 没有区分模型效果，而 alias cost 也不能解释为 GLM provider 实际成本。

Harness 实验臂在 Clarify research 中超时，未修改产品代码，且 `claude` 未返回最终 billing result。旧 runner 把缺失 cost 显示为 $0，已改为流式保存事件并标记 `measurementValid=false`；任何不完整账单都阻断公开结论。完整诊断见 [`pilot-2026-09-09.json`](../../benchmarks/model-uplift-v1/pilot-2026-09-09.json)。

2026-09-10 增加 Webhook 安全 case 后，请求 Haiku alias 的裸跑样本通过 7/7，stream 为 `glm-5.1`，最终 `modelUsage` key 为 `claude-haiku-4-5`。结合 CC Switch 配置，这两者分别是实际模型和 billing alias，属于预期路由；样本可进入弱模型效果诊断。其 $0.1052646 只是 Claude alias costUSD，不能进入 GLM 经济结论。诊断见 [`pilot-2026-09-10.json`](../../benchmarks/model-uplift-v1/pilot-2026-09-10.json)。

状态驱动 Harness runner 的后续诊断完成两个独立 code-explore packet、关闭 fact gate，并把 durable revision 从 1 推进到 2，证明旧版固定 6 分钟盲跑并非唯一可行驱动方式。但本轮 `requirements.md` 的原始需求只绑定入口说明，完整业务规格仅存在于附件文件，违反 Harness 自己的“附件是 evidence、不是用户原文”合同。运行因此被主动停止；runner 已改为首条消息内嵌完整规格，并以逐字 `rawRequestBound` 检查阻断同输入不成立的样本。

旧环境预检探测 Haiku、Sonnet、Opus 三个 alias 时，assistant stream 均报告 `glm-5.1`；这符合弱路由，但不符合 CC Switch profile 中 Sonnet/Opus 应为 GLM-5.2 的强路由。三次探针的 Claude alias costUSD 合计 $0.1474236，Sonnet/Opus 同时触发 $0.03 预算上限。该快照保留为错误/过期路由负样本；正式 `--case all` 要求 24 小时内、Claude Code 版本、CC Switch profile 和非 secret 路由摘要一致的 pass receipt，不提供 `--force` 绕过。

用户提供 CC Switch 设置截图后确认目标映射为 Haiku/Fable→GLM-5.1、Sonnet/Opus→GLM-5.2。fresh 预检仍观察到 Haiku alias 指向不可用的 `claude-haiku-4-5`，Sonnet/Opus 的 response model 为 `glm-5.3`；直接把 Claude 默认模型覆盖为 `glm-5.1/5.2` 又返回 `unrecognized_model`。这与 CC Switch 页面“仅在开启本地路由/代理接管后生效”的边界一致：模型名重写必须由 CC Switch 层完成，benchmark 不应伪造环境覆盖。当前正式矩阵继续 fail closed，等待 CC Switch 保存、启用接管并让新进程继承后重跑 preflight。

2026-09-15 在 `932d520` 上完成一次 4 轮 weak-harness 校准：headless decision bridge 成功消费 canonical question，raw request binding 和计费完整性均通过，但 CC Switch 请求级回执同时观察到 GLM-5.1 与 GLM-5.2。根因是 plugin named agents 明确声明 `model: sonnet`；Claude Code 2.1.251 以后 frontmatter 优先于单独的 `CLAUDE_CODE_SUBAGENT_MODEL`。该样本是路由污染负证据，不计入效果。修复改为所有 worker `model: inherit`，并在弱模型评测中同时设置 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`。污染样本此后仍保留逐模型请求数和 1:3 计次统计，但 `modelTierIdentityValid=false`，继续阻断发布。

同日 clean `4d6ce69` 上的单轮 weak-harness 路由探针完成：CC Switch 请求级回执覆盖 54 个成功请求，全部为 GLM-5.1；worker stream 同样只报告 `glm-5.1`，`modelTierIdentityValid=true`。资源统计为 54 中转计次单位、86,316 input、14,925 output、853,440 cache read、659,449ms。该运行限制为 1 dialogue turn，尚未进入业务问题，故 `accepted=false` 且不得用于效果比较；它只关闭弱模型整链路路由阻断。

随后 clean `c1c0498` 的首个完整开发样本在第 4 轮触发 `EH-PROMPT-RECEIPT-155`：runner 首轮发送原始需求，续轮却改成“继续当前 change”，被 Harness 正确识别为不同 host prompt。运行在完成 6 轮后人工停止，不能评分。修复后 Harness 每次 resume 重放同一原始业务请求，并增加连续三轮无问题即保留失败并停止的预算保护；该问题属于评测校准，不是产品门禁放宽。

续轮绑定修复后的下一次校准证明外置 headless hook bridge 仍不等价于真实交互：`Other` 自由文本只进入脚本 transcript，Claude session 仅看到 runtime 脱敏事件，因而重复追问。评测 runner 改用精确锁定的 `@anthropic-ai/claude-agent-sdk` 和官方 `canUseTool` AskUserQuestion callback，同时指定本机 Claude Code 2.1.268 executable；callback 在同一 agent loop 返回自由文本，让真实 plugin pre/post hooks 与 Claude 上下文同时消费答案。holdout bwrap 增加 SDK executable wrapper，仍遮蔽外部 case pack。

SDK 首轮探针还暴露弱模型恢复负担：模型把可信 research result ref 加入 candidate `evidenceRefs` 却漏填对应 digest，runtime 在能自动派生前先按完整 schema 拒绝，随后模型错误修改评分。`prepare-question` 现允许草稿缺少“当前可信 ResearchPacket ref”的 digest，再由 runtime 原子补齐；任意不可信 ref、非占位 stale digest 与其他 schema 错误仍 fail closed。Skill 同时收紧为草稿只写 targetRef + 64 零占位，禁止模型拼 `.git` run ref 或 hash。

CodeGraph 初始化后的 SDK 探针确认代码 worker 能产出 `codegraph-first` packet，但外部文档 worker 运行超过 15 分钟后 session lease 过期：Context7 被误拒，`SubagentStop` 也无法把带前言的非法结果拦下并要求重试。这一轮在 30 分钟硬超时结束，`measurementValid=false`，不计入效果样本。runtime 现由仍处于有效期、且 session/worktree 精确匹配的 Hook 活动续租；已过期 binding 仍只能走显式恢复，不能被 Hook 复活。

心跳修复后的 clean `ad40a77` 单轮探针在 942,847ms 内正常返回，controller/worker 均为 GLM-5.1，Context7 resolve/query 成功，`measurementValid=true`。它同时暴露第二个恢复缺口：doc worker 首次非纯 JSON 被 Stop Hook 拦下，修正后仍有 schema 类型错误；Claude Code 要求第二次 Stop 必须放行，但 Harness 未把该 run 标记为终态失败，导致后续重派被两个 active run 阻塞。该样本未提出业务问题，不计入效果对照。runtime 现在 stop-hook retry 耗尽时记录 terminal failure，不放宽 ResearchPacket schema，允许主 Agent 以更窄 brief 干净重派。

clean `90b5b13` 单轮探针在 385,445ms 内把 code/docs 两个 packet 持久化并成功 `close-research`，fresh status 明确返回 `clarifyReadiness.route=decisions`；controller/worker 均为 GLM-5.1，`measurementValid=true`。但弱模型随后错误输出“ready for topology / User question: none”而未加载 decisions authority，因此业务召回仍为 0，不计入效果对照。Harness Skill 现把 clean `research→decisions` 写成唯一明确的双 authority 同轮例外，并增加机械少样本：成功 close + route decisions 后下一个 tool call 必须是读取 `clarify-decisions.md`，失败 close 才允许返回 research blocker。

`08ebcd0` 单轮探针已跨过该 Skill 缺口：trace 明确进入 decisions、持久化 question candidate 并调用真实 `AskUserQuestion`。但 host callback 返回时工具结果为 error，最终 `stop_reason=tool_use`，因此仍没有可评分答案。运行时审计发现仓库锁定 Agent SDK 0.3.272（声明配套 Claude Code 2.1.272），实际复用的本机 executable 为 2.1.268；这不是业务效果失败，而是不可接受的 SDK/CLI 协议错配。runner 现锁定 SDK 0.3.268 并在启动时校验其声明版本与 executable，错配直接失败，不把协议错误计作模型效果。

配套后的 clean `f674238` 探针完成了首个真实 callback 闭环：SDK 0.3.268 与 Claude Code 2.1.268 三方版本字段一致，controller/worker 均为 GLM-5.1，`AskUserQuestion` result 成功，`sdkDecision=Q-1`，脚本化自由输入命中 `eligible-window` 与 `partial-refund` 两项隐藏事实；`measurementValid=true`，单轮关键未知项召回 0.194、未经询问假设率 0。该样本仍未验收，且 Main 在回答后错误继续准备后续问题直至 `error_max_turns`，耗时 1,298,860ms、alias 估算成本 0.5602；不能作为效果优势，只证明 bridge 可用并暴露“一问后必须结束当前 assistant turn”的 Skill 成本缺口。

clean `dcabf9d` 回归中，`AskUserQuestion` 成为最后一个工具动作，Claude 正常 exit 0，未再触发 `error_max_turns`；输出 token 由 27,331 降至 13,955、alias 估算成本由 0.5602 降至 0.2634、耗时由 1,298,860ms 降至 958,428ms。两次生成路径不同，因此这些比例只作诊断，不作为因果或推广结论。该轮问题“用户自助退款功能应如何验证成功与失败？”是维度级总问句，没有命中具体隐藏业务决策，召回为 0；这暴露 frontier 仍需先展开为具体 decision surface，并按权限/资金/一致性风险而非笼统维度优先。

clean `a248882` 探针证明通用问题 validator 生效：首次 candidate 以 `EH-QUESTION-CANDIDATE-106` 被拒，弱模型完成改写、修复 synthesis 并成功 prepare；但最终 Ask result error、无可评分回答，既有脱敏 trace 不能区分 pending 缺失与 payload mismatch。审计同时发现 SDK host callback 使用 `JSON.stringify` 比较问题 payload，存在把字段顺序不同而语义相同的对象误判为不一致的确定性缺陷。runner 因而改用结构化深比较并增加脱敏诊断。

clean `98b6181` 重跑把实际分支定性为 `ask-input-canonical-mismatch`：pending candidate 存在，但弱模型在 Ask 前把它改写成“适用于哪些订单？退款条件有哪些限制？”的两问合一 payload。评测宿主此前以 `interrupt=true` 直接终止，未给 Claude Code 按拒绝信息恢复的机会。现在 mismatch 采用非中断 deny，要求原样重读 pending candidate 后重试，并把诊断改为有序 `callbackDiagnostics`；runtime 同时拒绝不恰好包含一个问号的 candidate，不替模型或评测宿主静默改写问题。

clean `a5f31ac` 单轮探针满足基础闭环验收：`callbackDiagnostics=["answered"]`、`sdkDecision=Q-1`、Ask result 成功且为最后一个工具动作、Claude exit 0；问题精确询问“自助退款失败后，订单应该保持原状态还是进入待处理状态？”，脚本化用户回注 `deterministic-failure`，关键未知项召回 0.065、未经询问假设率 0、`measurementValid=true`。controller/worker 均为 GLM-5.1，SDK/CLI 均为配套 2.1.268。该样本只证明真实探索→具体问题→callback→正常停轮可运行；单轮未验收且耗时 1,401,163ms，不能支持弱模型比肩强模型或更经济的公开结论。下一步是有限多轮 development 校准连续问题质量与召回曲线。

clean `8c3d3ba` 四轮校准在三轮无问题后提前停止：首轮已 prepare Q-1，但弱模型连续 10 次重写 Ask payload，后续恢复轮仍展示 Markdown 或改写选项，`callbackDiagnostics` 只有 mismatch、没有 answered。总耗时 957,018ms、召回 0；这与真实 pre-question hook 的阻断一致，不能通过放宽评测器解决。runtime 现在让 `prepare-question` 与 pending `clarify status --json` 直接返回 canonical `toolInput`，Skill 要求下一个动作原样透传该对象，消除弱模型从 candidate 重建 UI payload 的推理负担。

2026-09-29 的后续校准把“模型未提问”和“评测宿主未闭环”分开处理。clean `c622ef9` 的单轮 GLM-5.1 Harness 探针成功调用确定性 `persist-synthesis`、提出“自助退款功能应支持哪些订单状态的退款？”，命中 `eligible-window`，关键未知项召回 0.0968；模型身份、raw request、账单和运行完整性均有效。该样本只完成一问，按预期未验收，不能证明相对 GLM-5.2 的效果。

随后两次四轮样本均作为负证据保留。`4c538fa` 把普通业务范围问题错误路由为 `scope-confirmation`，重复四轮且召回为 0；`ae5cbb3` 修正后首问以 `clarify-answer` 命中 `partial-refund`，但 pending Q-1 没有被 post-question 持久化，第二轮继续重复。根因不是 scripted user 或业务评分，而是 Claude Agent SDK 0.3.268 / Claude Code 2.1.268 在配置 `canUseTool` 时没有触发本地 AskUserQuestion 的 plugin/SDK PreToolUse 与 PostToolUse 回调。runner 已移除 `canUseTool`，改用 SDK PreToolUse 为非交互工具提供最小授权，并由 AskUserQuestion 的 PreToolUse 注入 canonical answers、PostToolUse 调用同一 `resolveClarifyQuestion`；`questionBridgeValid` 要求同时出现 `sdk-pretooluse-authorized`、`answered`、`sdk-posttooluse-persisted`，缺任一标记即 fail closed。

兼容宿主的三次探针没有被包装成模型效果：`00cc0d0` 证明 `canUseTool` 与 SDK hooks 并存仍不触发 Ask hook，`questionBridgeValid=false`；`6a01567` 移除 `canUseTool` 后因 Bash 无非交互授权而提前退出，身份与 raw-request binding 无效；`df020ca` 补齐 SDK PreToolUse 授权后恢复 `measurementValid=true`，但 trace 在到达 Ask 前反复返回 `EH-CLARIFY-SYNTHESIS-170`。逐条 session 审计确认模型调用为 `clarify persist-synthesis <change-id> <input-ref> --json`，而 CLI 当时拒绝尾随 `--json`。clean `2956133` 已让该命令接受可选 `--json`、拒绝未知 flag，并通过 253-file prepublish gate；新的真实单轮 bridge 探针尚未完成。因此当前正式效果观测仍为 0，仍不可对外声称“GLM-5.1 + Harness 比肩 GLM-5.2”。

clean `8ed97fe` 的复验已证明 synthesis 修复有效：CodeGraph 与 Context7 packet、`close-research`、`synthesis-sources`、尾随 `--json` 的 `persist-synthesis` 和具体 Q-1 全部一次通过；controller/worker 均为 GLM-5.1，exit 0，耗时 552,998ms。随后模型发现 SDK tool catalog 中不存在 `AskUserQuestion`，把问题渲染为 Markdown，导致 transcript 为空。旧判定对“从未 answered”的 invocation 真空返回 `questionBridgeValid=true`，因此该记录是 benchmark false positive，不是效果 0 分。runner 现显式使用 Claude Code tool preset、允许 `AskUserQuestion`，并在结束时发现 durable pending question 时强制 `questionBridgeValid=false`；修复后的新实测仍待完成。

clean `fbc77d5` 复验证明 pending fail-closed 已生效：controller/worker 身份、raw request 与账单均有效，但 `pendingQuestionAtEnd=true` 令 `questionBridgeValid=false`、`measurementValid=false`，Markdown 问题不再计成业务 0 分。该轮在一次 duplicate source assignment 后自修复 synthesis，准备了退款失败/超时状态问题；耗时 924,291ms。SDK 进程参数已包含 `--allowedTools AskUserQuestion --tools default`，但模型可见工具列表和 ToolSearch 仍没有 Ask，证明 allowedTools 只授权既有工具，不能在此 headless 路径注册交互工具。runner 因而恢复 `canUseTool` 作为工具暴露宿主，并绑定其唯一 `toolUseID`；只在事件流收到 matching successful tool result 后持久化，不依赖该路径不会触发的本地 hooks。新适配器尚待 clean 实测。

clean `f5f96fc` 复验确认 `canUseTool` 已真实暴露结构化 `AskUserQuestion`，进程参数为 `--permission-prompt-tool stdio --tools default`，模型调用了 canonical pending Q-1；但 permission host 调用 runtime core 时得到 `EH-QUESTION-ACTIVE-108: no active change is bound`。pending 与 session binding 都存在，根因是 core 只从父 Node 进程环境解析 active change，而 Claude session ID 仅传给子进程。该运行按新规则正确得到 `pendingQuestionAtEnd=true`、`questionBridgeValid=false`、`measurementValid=false`，不计效果。core 现为 authorize/resolve 增加可选 session context，adapter 显式传入 session ID；行为测试删除 `ACTIVE_CHANGE` 后仍可完成两步，证明不依赖 v5 compat 文件。尚待下一次 clean 真实复验。

2026-10-01 本机 Claude Code 自动更新为 2.1.284 后，旧 SDK 0.3.268 在任何模型请求前按版本门禁拒绝。仓库已把 Agent SDK 精确锁定为 0.3.284，包内声明的 `claudeCodeVersion` 与本机 executable 均为 2.1.284，253-file prepublish gate 通过。clean `1e03d06` 的单轮复验随后正常 exit 0，但不是 bridge 结果：当前启用的 CC Switch provider 虽名为 `glm-5.2 copy`，Haiku/Sonnet/Opus/Fable 实际都映射到 `glm-5.3-flash`；同 session 的 13 条成功记录也全部为该模型，强制 worker 模型 `claude-haiku-4-5` 则不可用，两个 research run 均未启动。该样本 `modelIdentityValid=false`、`measurementValid=false`、无问题、召回 0。当前 CC Switch local proxy disabled，日志 `data_source=session_log` 只作诊断，route exporter 正确拒绝生成要求 `data_source=proxy` 的权威回执。恢复 5.1/5.2 角色映射和 proxy logging 前，不再消耗正式采样预算；本样本不能证明或否定 session-context 修复。

用户把四个角色都保存为 GLM-5.1 后，fresh Haiku preflight 在与保存配置一致的子进程环境中通过，response/billing 均为 `glm-5.1`。但 clean `efaf634` 单轮仍在 worker dispatch 处停止：controller 为 GLM-5.1，`CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5` 被 gateway 判为不可用，worker stream 为空，故 `modelIdentityValid=false`、`measurementValid=false`。当前 Claude Code 模型配置合同明确接受 model alias，并把 `CLAUDE_CODE_SUBAGENT_MODEL` 纳入 subagent 模型控制面；矩阵因此改为 `haiku` alias，让 CC Switch 的 Haiku→GLM-5.1 映射实际生效，同时保留 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` 与 route receipt 污染门。旧样本中 alias 曾落到 GLM-5.2 的事实仍保留为环境漂移负证据，不用于否定当前官方合同。

clean `cd2e457` 复验证明 alias 修复与 session-context bridge 都已闭环：controller、CodeGraph worker、Context7 worker 均为 GLM-5.1；两个 ResearchPacket 落盘后主 Agent 生成具体问题“订单处于哪些状态时允许用户自助发起退款？”，host 以真实自由文本回注资格窗口和退款状态。`callbackDiagnostics` 完整包含 `sdk-canusetool-authorized`、`answered`、`sdk-tool-result-persisted`，pending 清空、transcript 非空、`questionBridgeValid=true`、`measurementValid=true`。该单轮命中 `eligible-window` 与 `refund-state`，关键未知项召回 0.194、未经确认假设率 0、evidence grounding 0.5；耗时 1,342,966ms，input/output 分别 105,509/47,223。样本只完成一问，`accepted=false`，且 CC Switch local proxy logging 仍关闭，因此不进入正式效果对照。下一步是有限多轮 development 校准召回曲线，再恢复 Sonnet/Opus→GLM-5.2 与 proxy logging 做三臂正式采样。

clean `56de946` 的四轮 GLM-5.1 development 校准完成 CodeGraph/Context7 与四次真实 SDK 问答闭环，但只能作为缺陷证据：第 2 轮在新 questionId 下逐字重复第 1 轮问题；4 轮只命中 `partial-refund`、`eligible-window`、`ownership` 三项，关键未知项召回 0.290、最终需求覆盖 0、`accepted=false`。alias 估算累计成本 $10.38213，超过请求的 $8 上限，说明仅把余额传给 SDK 不能形成宿主硬预算。runtime 现对所有已解决候选比较 canonical Ask 载荷，即使此前选择 Other 也拒绝同文重问；runner 在下一轮前保留既有最大单轮成本，并把实际超限样本标记为 `budgetLimitValid=false`、`measurementValid=false`。该运行的最小审计摘要见 [`multiturn-calibration-2026-10-02.json`](../../benchmarks/model-uplift-v1/multiturn-calibration-2026-10-02.json)，不进入模型效果对照。

CC Switch 保存后于 2026-09-10 再次 fresh 预检：Haiku 仍指向不可用的 `claude-haiku-4-5`；Sonnet 在相邻两次探针中分别返回 `glm-5.2` 与 `glm-5.3`。这不是可重复的 GLM-5.1/5.2 对照环境。五臂 runner 因而只探测实际使用的 Haiku/Sonnet，并继续要求二者在同一 fresh receipt 中全部匹配目标身份。

## 正式评测设计

至少覆盖 brownfield + versioned SDK、stale requirements、interrupted session、adversarial path、TDD + independent review、archive replay 六类 case。模型放大正式结论每项比较至少需要 20 对 measurement-valid 观测并覆盖至少 5 个不同 holdout case；10 对只用于诊断置信区间，不能发布产品主张。

2026-09-10 五臂探索矩阵与业务澄清轨落地；2026-09-14 正式矩阵收敛为弱裸、全弱 Harness、强裸三臂，减少与主张无关的采样。开发题库包含 5 类业务问题，脚本化用户按问题命中返回事实，确定性 grader 检查关键未知项召回、最终覆盖、未经询问的业务假设、证据落地和提前代码写入。仓库内 development pack 永久不可发布；正式 holdout 必须从仓库外注入并记录 digest。公开效果门为每项比较至少 20 对、至少 5 个不同 holdout case；10 对只提供诊断置信区间。

2026-09-14 根据 CC Switch 请求记录修正模型身份边界：alias 与 response model 只负责运行期诊断，正式 GLM-5.1/5.2 档位由 CC Switch proxy log 的 Claude session ID、实际 model 和 invocation 时间窗闭环，写入 `modelTierIdentityValid`。同一回执按用户确认的中转规则累计实际请求：GLM-5.1=1 单位、GLM-5.2=3 单位；这是资源统计而非效果门槛，无需 provider CSV。业务澄清开发样本同时修复了“误取选项中的问号”“换一种问法被当成题库外”两类 runner 偏差，补入资格、审批、权限、状态、并发重复提交等真实退款决策，并按完整轮原子保存 checkpoint。该开发样本仍不可用于宣传结论。

holdout 的本地隔离由 runner 强制执行：case pack 必须位于 `/var/tmp`，Claude 调用经 bwrap 运行并以 tmpfs 遮蔽整个 `/var/tmp`；代码 fixture 与必要用户环境仍可用。isolation receipt 由实际 wrapper 自动产生，不能再用任意 JSON 声称“容器隔离”。当前只支持 Linux/bwrap，远程盲评保留为后续扩展。

一次单轮 route receipt dry-run 还证明 Sonnet controller 会伴随 Claude Code 内部 Haiku 辅助请求：实际路由同时出现 GLM-5.2 与 GLM-5.1。实验臂因此增加 `allowedActualModels`：所有弱臂仅允许 GLM-5.1，任何 GLM-5.2 泄漏都使样本无效；混合臂与强 controller 臂允许 5.1/5.2，内部辅助的全部资源和费用照常计入。“强模型”口径只描述 controller，不再写成所有请求纯强。

clean `764d55d` 的真实 bwrap 单轮探针中，用户消息明确给出 holdout 绝对路径；Claude 报告该路径不存在，同时成功读取 fixture 中公开 evidence、提出审批角色问题并 exit 0。assistant 输出中的隐藏标记命中数为 0，产品代码变化为 false。该证据只验收隔离机制，不计入模型效果样本。

随后在任何正式效果数据产生前冻结外部 holdout v1：5 个企业业务 case、36 个加权关键未知项；case/fact ID 唯一、全部正则可编译、每个事实可由 scripted user 命中，完整 oracle transcript 对 5 个 case 均通过。Git 只保存 SHA-256 与非秘密 manifest，pack 内容保持在 bwrap 遮蔽的 `/var/tmp`。正式观测仍为 0。

同日基于 clean `891406a` 与 Claude Code 2.1.268 的 fresh preflight 首次同窗通过：Haiku response=`glm-5.1`、billing=`claude-haiku-4-5`；Sonnet response=`glm-5.2`、billing=`claude-sonnet-4-6[1M]`，两条探针均 exit 0、complete。该回执证明 CC Switch 强弱采样入口已经就绪，不是效果样本；公开结论仍需外部 holdout、20 对/比较和 CC Switch 请求级路由回执。

三臂 development 校准随后发现两类 benchmark-host 偏差。第一版 Harness 首条消息把 change ID 和评测控制话术也放入 UserPromptSubmit，requirements 只保存真实业务请求时被 continuity gate 正确拒绝；现改为首条消息仅含 Skill 路由与原始请求，changeId 从携带同一 session identity 的 workflow status 动态发现，并用 `rawRequestBound` 复验。第二版完成 code/docs research 后，在 headless `-p` 中无法获得交互式 AskUserQuestion UI，普通 resume 文本不会产生 post-question 决策回执；现由 runner 只对已经 prepare 的 canonical candidate 执行真实 pre/post-question hook，业务选项由冻结 scripted truth 决定。校准流还观察到 `CLAUDE_CODE_SUBAGENT_MODEL=haiku` 下 worker response=`glm-5.2`；根据官方模型配置要求，override 改为完整 `claude-haiku-4-5`，最终仍由 CC Switch route receipt 判定弱臂是否污染。这些失败样本不计入正式观测。

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
