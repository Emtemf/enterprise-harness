# Clarify Topology and Decisions

Load when: controller state is active v6 Clarify, factGateOpen=false, and topology or the user Decision frontier remains open.
Return to controller: after exactly one topology, scoring, candidate, or authorized answer action; recompute state and do not continue into completion in the same turn.

### 评分算法（必须从空集合开始）

1. 每个 `component × predicate` 初始都是 **unmet**。只有与来源中完整语义分句精确匹配的 claim、已记录的用户 round answer、
   或 validated ResearchPacket fact 能把它改为 covered；常识、默认方案和 Main 补全不能。
2. 本 reference 的 load predicate 已保证 factGateOpen=false；若 lane state 改变，立即返回 controller，不在此定义例外。
3. 任一 applicable decision surface 为 pending/open：它所影响的 Scope、Constraints 或 Acceptance predicate
   保持 unmet，对应维度最高 3。不能一边列 pending decisions，一边把维度写成 4/5。
4. score 4 = 本维度全部 readiness predicates covered；score 5 = score 4 + 含“确认/批准/按此进入下一阶段”等
   明确授权措辞的 `confirmed` evidence。
5. “赶时间”“你自己决定”“按合理默认”不是 scope confirmation，也不能覆盖任何用户 Decision predicate。

例：`想做个简单的登陆` 只给出方向，不能证明 consumer、included/excluded scope、技术/风险约束、失败验收、
current state 或任何认证策略；不得 Fast Path。

## Phase 2：综合事实并建立 topology

1. 只从用户请求、已验证 ResearchPackets 和已有 durable decisions 提取 1–6 个可独立成功或失败的
   top-level components。文件、字段、实现步骤和 Authentication risk surfaces 不是 component；原请求只说
   登录时，不能静默增加注册、账号 CRUD、登出、恢复或独立 UI outcome。只有一个用户可见 outcome 且
   没有 evidence 支持拆分时，topology 必须只有一个 component；例如模糊的登录请求先记为
   `login-capability`，credential verification 和 session lifecycle 留在 decision surfaces，不拆成 components。
2. 建立 design tree 与 decision frontier；对每个 active component 评估
   `Goal / Scope / Constraints / Acceptance / Context`。先建立 Evidence ledger，再按 readiness predicates
   计分：Goal=`consumer,outcome`；Scope=`included,excluded`；Constraints=`technical,risk`；
   Acceptance=`success,failure,observable`；Context=`need,current-state`。达到 4 必须覆盖本维度全部谓词；
   达到 5 还必须有 `confirmed`。普通 evidence 每行只能支持一个 predicate 或 decision surface，同一来源分句
   只能登记一次（raw-request locator 固定为 `original-request`）；只有明确肯定的确认分句可以同时支持本次
   确认覆盖的多个 `.confirmed`，否定确认不算；使用模板列出的无歧义确认选项原文，不从开放文本关键词猜测批准。
   模型推断不是 evidence，
   不能截取关键词、复用同一句宽泛描述或自报 `Supports` 来替代未覆盖谓词。`user-decision` 必须绑定
   `user / resolved` 且 Source 为 user 的 Decision round；ResearchPacket claim 必须精确匹配 `facts[].claim`。
   API/Data 仅在相关时展开；不适用时写 `N/A` 与依据。
   每次重算后从 runtime 读取只读摘要：全局 `ambiguity index = 未覆盖的适用 predicate / 适用 predicate 总数 × 100`、
   每个 component 的覆盖数与最低维度分数、未决高风险数。指数 0 只表示 predicate 已覆盖；正式推进仍要求
   全部维度 ≥4、无 high-risk pending、无 pending question。该摘要由同一评分表和 Evidence ledger 派生，
   摘要只在 `clarify status --json` / `workflow status --json` 投影和用户输出中展示，不写回 requirements；
   不得手填第二套分数，也不得恢复旧七维固定量表。
3. 展示 provisional topology、每个 component 的边界和 fact-derived 评分依据。除 Fast Path 外，
   topology 确认也必须先走 Phase 3 的 candidate → prepare-question 协议，再用一次 `AskUserQuestion` 让用户
   添加、删除、合并、拆分或 defer components；确认后才锁 topology。
   Round 0 只确认 topology，不得同时询问使用端、凭证方式或其他 Decision；这些进入后续一问一答。
   Round 0 的输出形状固定为：已证据支持的 top-level outcomes + `确认当前拓扑（推荐）` / `调整拓扑` /
   `defer 某项` + 自由输入。问题正文和选项不得夹带第二个问号或要求选择业务方案。Round 0 没有
   dependency、减少轮次或“赶时间”例外；把 identity/credential 选项附在 topology 题后就是批量两问。
   模糊登录案例的 Round 0 只能问：`login-capability 作为当前唯一 top-level outcome 是否正确？`，
   选项只能是确认、调整、defer；identity source 必须等 topology 锁定后单独问。
4. 新 component 只能通过增量 topology 确认加入，不得静默扩大 scope。
5. 原始请求涉及登录、认证、身份、凭证或 session 时，固定展开 Authentication decision surfaces：
   identity source、credential authority、session lifecycle、failure/abuse、recovery/MFA、observable
   acceptance。必须恰好展示这六项，不能因“简单”省略 observable acceptance。固定的是覆盖面，不是固定
   问题；CodeGraph/Context7 先解决 Facts，剩余 Decisions 才提问。“登录通常意味着成功”之类常识不能
   覆盖 Acceptance.success，只有用户原文/answer 的可观察成功条件才能覆盖。

## Phase 3：只澄清 Decisions

1. Frontier 只包含 facts 完成后仍未解决的 `component × dimension` Decision。优先 high-risk，风险相同
   时选最低分。Facts 永远回到 Phase 1，不问用户。
2. 每次仅用一次授权询问一个用户问题，一次只生成一个问题。读取
   [question candidate 模板](../assets/question-candidate.json.tmpl)，把当前 frontier
   渲染为 schema-valid canonical
   `harness/changes/<change-id>/evidence/clarify/questions/<question-id>.json`：一个 user-only Decision、受验证的
   `decisionType`、canonical `targetRef`、2–4 个互斥选项、recommendation、evidence refs、当前 input digests
   和 `blocking=true`。所有用于问题、选项或推荐的 ResearchPacket 都必须同时出现在 `evidenceRefs` 与
   `inputDigests`；任一 packet 变化都会使 candidate stale。不把 rationale、聊天文本或第二问
   塞进 tool payload。
3. 运行
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify prepare-question <change-id> <candidate-ref>`。
   `header` 最多 12 个字符；candidate label 不含推荐标记，projection 只给 `recommendedOption` 对应 label
   追加唯一可见的 `(Recommended)`。不要自行提供 `Other`，Claude Code host 会提供自由输入入口。
   只有 exit 0 才能把 candidate 逐字段投影为一次 `AskUserQuestion`；pre-question hook 会核对 pending
   authorization，不能绕过或手改 pending state。
4. post-question hook 按 candidate 的 `decisionType` 与 `targetRef` 把选中的授权 option 原子追加为 public
   `DecisionEvent`，而不是保存聊天记录或隐藏推理。若用户选择 host `Other`/自由输入，hook 不持久化原文，
   只追加固定、脱敏的 `clarify-answer` / `selectedOption=other` 事件；该事件不满足 typed disposition，Main 必须
   从 fresh frontier 生成新问题。
   回答 durable 后重新计算所有受影响分数，展示上轮→本轮、依据和新的 weakest/highest-risk frontier；下一问
   必须从新 frontier 重新生成 candidate，不复用旧队列。用户可见摘要必须同步展示歧义指数的上轮→本轮变化。
5. 只要仍有 sibling component < 4，同一 component 最多连续问 2 个 Decision；只有 sibling 明确依赖
   当前决定才可例外，并在 round ledger 写 dependency evidence。

### Fast Path

Fast Path 只减少用户问题，不跳过 Phase 1 或 question authorization。初始需求、全部 required ResearchPackets 与既有确认已经让
所有 active component 的关键维度 ≥ 4，且没有 high-risk assumption 时：生成 topology、完整评分、
non-goals 和 requirements 摘要；原请求已明确授权完整 scope 时记录为确认来源，否则最多用一次
经 prepare-question 授权的 `AskUserQuestion` 联合确认。每个高分谓词必须引用 Evidence ledger 中可回溯到原文、用户 round answer
或 validated ResearchPacket 的 evidence ID；不得用 overall 平均值或模型补全掩盖低分格。
