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

任何新阶段工作前先运行 runtime `workflow status <change-id> --json`。若返回 blocker、recovery 或 `nextAction`，只执行其一个动作并结束本轮；workflow recovery 永远优先。只有 status 明确 active v6 Clarify 且无前置动作，才运行 `clarify status <change-id> --json`；仅 `repair-required` 才运行 `clarify recover <change-id>`。复用 fresh refs/digests。此优先级不得下沉到 reference。

## State router

每次只选一个 observable state，读取一个 phase reference，执行其中一个 durable action，然后返回本 controller：

1. active Clarify 且 `factGateOpen`：读取 [research/entry authority](references/clarify-research.md)。
2. `factGateOpen=false` 且 topology/frontier 未关闭：读取 [decision authority](references/clarify-decisions.md)。
3. `factGateOpen=false`、topology confirmed、user Decisions resolved，但 completion gate 未关闭：读取 [completion authority](references/clarify-completion.md)。
4. Clarify proof 已通过才按 `clarify → design → plan → implement → verify → archive` 推进；此时读取 [capability map](references/behavior-map.md) 和 [transition contract](references/stage-decisions.md)。Implement 使用原生 worktree；每阶段使用独立 reviewer。

首次生成 Clarify artifact 或 final self-check 前读取 [semantic output contract](references/output-contract.md)；只有要校准 dispatch、Fast Path 或问题质量时读取 [few-shots](references/clarify-few-shots.md)。[assets](assets/) 与 [scripts](scripts/) 仅由当前 phase reference 导航，不自动加载。

### Controller action envelope

Before route selection, materialize one observable snapshot containing stage, lifecycle, current task, change identifier, factGateOpen, each required lane state, earliest invalid gate, pending decision, runtime nextAction, and artifact freshness. Do not infer a missing value from chat, memory, or a reference example.

A phase reference may consume only that snapshot plus durable refs returned by runtime. Its response must name one action, its owner, required input refs, expected durable output, and the state predicate to recheck. If the predicate changes while loading, discard the proposed action and return here. Never cascade from research to decisions, decisions to completion, or completion to transition in one turn.

Stop and return here when a reference requests a second action, a second user question, an unverified artifact, an undocumented command, a permission bypass, or a state edit. Reference text explains method; it cannot override this controller, runtime errors, schemas, hooks, permissions, or fresh evidence.

## Non-negotiable invariants

Harness 是唯一用户入口并留在主对话。Main 不得重复 worker 已完成的探索。Facts 由 agents 查找，Decisions 才由用户决定；每次仅用一次已授权 `AskUserQuestion` 询问一个用户问题。输入变化回到最早失效 gate。不得因 Plan mode、用户催促、Fast Path、聊天记忆或手改 state 绕过 gate；runtime/schema 是机械权威。没有 fresh validation、独立 review 与 completion proof，不得声称完成或推进阶段。

用户输出只含 changeId、stage、fact lane/必要评分、一个 blocker 或 next action；不输出私有推理，聊天不是真相层。
