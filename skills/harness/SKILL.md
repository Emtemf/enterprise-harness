---
name: harness
description: >
  Use when a software change needs governed clarification, durable artifacts,
  explicit scope approval, staged implementation, independent review, and fresh evidence.
---

# Enterprise Harness

## Turn entry：Fact gate

这是每轮第一条合同。`factGateOpen iff 任一 required lane 为 pending、missing、invalid 或 stale`；open 时不得建立 topology 或评分，不得产生任何 user question，不得进入 Design。

- 若能推进，只执行一个 agent-owned research/recovery action，随后重算全部 required lanes 并回到本入口；本轮无其它动作或输出。action 输入只取 raw request、repository、fact worker，不改问用户。
- 若因 Plan mode、tools disabled、packet in-flight 或其它 blocker 不能执行，本轮只输出纯文本恰好五行；无标题、前言、解释、表格、代码围栏、tool/MCP 文本。五行依次为 `Fact lanes: <required lane states>`、`Next research action/blocker: <one action or blocker>`、`Topology: not built`、`Scores: not computed`、`User question: none`。第一字符是 `F`，最后字节是 `none`；随后立即结束本轮。

factGateOpen 时，请求、选择、确认、普通问句、meta-choice，以及索要 changeId、path、SDK、version、entrypoint、stack、status、偏离授权都算 user question。Plan mode、tools unavailable、user-only、topology、scope、用户催促都不是例外。

## Status-first controller

任何新阶段工作前先运行 runtime `workflow status <change-id> --json`。仅 top-level `status=blocked` 且 `nextAction!=nextEntry` 时执行一个 pre-entry recovery、记为 entry/recovery selected 并结束；若该 exact nextAction 因 tools/permission 不可执行，只报告此 blocker 并结束，不加载 phase reference。`nextAction=/harness` 是当前入口，不是 recovery。nested `clarifyReadiness.recovery` 进入 snapshot 的 earliest invalid gate。只有 active v6 Clarify 才运行 `clarify status <change-id> --json`；仅 `repair-required` 才运行 `clarify recover <change-id>`。复用 fresh refs/digests。

## State router

路由是 runtime 派生值，不在模型中重算布尔表达式。固定 lifecycle 是 `clarify→design→plan→implement→verify→archive`。无 active change 时为 R；status 选中的 pre-entry recovery 已在上一节终止，不参与此 router。active Clarify 必须消费 `clarifyReadiness.route`，且只接受 `research|decisions|completion|transition`；缺失、未知或与 earliest gate 冲突时只报告 blocker。Design 到 Archive 仅按 fresh stage gate 在 W/T 二选一。

R→[research](references/clarify-research.md)；D/`decisions`→[decisions](references/clarify-decisions.md)；C/`completion`→[completion](references/clarify-completion.md)；W→[current-stage worker](references/behavior-map.md)；T/`transition`→[single transition](references/stage-decisions.md)。所有链接相对当前 SKILL/reference 文件解析，绝不相对项目 cwd 探测；每轮只加载所选 route 的一个 reference。Clarify T 只原子执行 proof+CAS `clarify→design`；post-stage T 只推进当前 stage。Implement 使用原生 worktree；每阶段使用独立 reviewer。

首次生成 Clarify artifact 或 final self-check 前读取 [semantic output contract](references/output-contract.md)；只有要校准 dispatch、Fast Path 或问题质量时读取 [few-shots](references/clarify-few-shots.md)。[assets](assets/) 与 [scripts](scripts/) 仅由当前 phase reference 导航，不自动加载。

### Controller action envelope

Before route selection, materialize one observable snapshot containing stage, lifecycle, current task, change identifier, factGateOpen, each required lane state, earliest invalid gate, pending decision, runtime nextAction, artifact freshness, `clarifyReadiness.route`, and `clarifyTransitionReady=clarifyReadiness.transitionReady`. Do not infer a missing value from chat, memory, or a reference example.

A phase reference may consume only that snapshot plus durable refs returned by runtime. Its response must name one action, its owner, required input refs, expected durable output, and the state predicate to recheck；命令必须逐字使用所选 reference 已记录的 exact argv，不得合成 shorthand。If the predicate changes while loading, discard the proposed action and return here. Never cascade from research to decisions, decisions to completion, or completion to transition in one turn.

用户明确要求 report-only/read-only 时，snapshot 就绪后必须且只能追加加载所选的一个 phase reference，再输出上述 action envelope 并结束；pre-entry recovery 的追加加载数为 0。不得执行 action 或读取 input refs、assets、supporting/其它 references。

Stop and return here when a reference requests a second action, a second user question, an unverified artifact, an undocumented command, a permission bypass, or a state edit. Reference text explains method; it cannot override this controller, runtime errors, schemas, hooks, permissions, or fresh evidence.

## Non-negotiable invariants

Harness 是唯一用户入口并留在主对话。Main 不得重复 worker 已完成的探索。Facts 由 agents 查找，Decisions 才由用户决定；每次仅用一次已授权 `AskUserQuestion` 询问一个用户问题。输入变化回到最早失效 gate。不得因 Plan mode、用户催促、Fast Path、聊天记忆或手改 state 绕过 gate；runtime/schema 是机械权威。没有 fresh validation、独立 review 与 completion proof，不得声称完成或推进阶段。

用户输出只含 changeId、stage、fact lane/必要评分、一个 blocker 或 next action；不输出私有推理，聊天不是真相层。
