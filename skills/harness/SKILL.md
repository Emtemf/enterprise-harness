---
name: harness
description: >
  用于软件变更需要受治理的需求澄清、持久化制品、明确范围批准、分阶段实现、独立评审和新鲜证据时。
hooks:
  Stop:
    - hooks:
        - type: command
          command: node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/stop.mjs" --terminal-fallback-scope
          timeout: 30
          statusMessage: 校验 Harness fact-gate 终止格式
---

# Enterprise Harness

## Turn entry：Fact gate

这是每轮第一条合同。`factGateOpen iff 任一 required lane 为 pending、missing、invalid 或 stale`；open 时不得建立 topology 或评分，不得产生任何 user question，不得进入 Design。

显式 report-only/read-only 请求是只读诊断，不是 workflow action turn：snapshot 就绪后必须且只能追加加载所选的一个 phase reference，输出 action envelope 即结束；pre-entry recovery 的追加加载数为 0。不得执行 action 或读取 input refs、assets、supporting/其它 references。

- 若能推进，执行 runtime 选择的 bounded research pipeline：同步 lanes、派发全部 required fact workers、
  `close-research` 后重取 snapshot。只有新 route 精确变为 `decisions` 时，才可在同一 assistant turn 继续生成并
  授权一个业务问题；这是唯一同轮 phase handoff。pipeline输入只取raw request、repository、fact worker；
  任一 research blocker/recovery 都立即结束，不改问用户。
- 若因 Plan mode、tools disabled、packet in-flight 或其它 blocker 不能执行，本轮只输出纯文本恰好五行；无标题、前言、解释、表格、代码围栏、tool/MCP 文本。五行依次为 `Fact lanes: <required lane states>`、`Next research action/blocker: <one action or blocker>`、`Topology: not built`、`Scores: not computed`、`User question: none`。第一字符是 `F`，最后字节是 `none`；随后立即结束本轮。

factGateOpen 时，请求、选择、确认、普通问句、meta-choice，以及索要 changeId、path、SDK、version、entrypoint、stack、status、偏离授权都算 user question。Plan mode、tools unavailable、user-only、topology、scope、用户催促都不是例外。

## Status-first controller

Skill 的第一个 tool call 必须是下面的 exact argv，早于 `ls`、Glob、Grep、Read、CodeGraph、Context7
或 ToolSearch；changeId未知时省略，返回no active是成功snapshot，绝不索要ID。Main不直接探索事实。不要把它改写成 `npx`、全局 `enterprise-harness` 命令或自造 wrapper：

`Bash.command` 必须在最后一个参数处结束；禁止追加 `2>&1`、`| head`、`| tail`、管道、重定向或连接符。
被 hook 拒绝时按原 argv 重试一次，不猜测替代命令或绕过 Skill。

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" workflow status <change-id> --json
```

仅 top-level `status=blocked` 且 `nextAction!=nextEntry` 时执行一个 pre-entry recovery、记为 entry/recovery selected 并结束；若该 exact nextAction 因 tools/permission 不可执行，只报告此 blocker 并结束，不加载 phase reference。`nextAction=/harness` 是当前入口，不是 recovery。nested `clarifyReadiness.recovery` 进入 snapshot 的 earliest invalid gate。只有 active v6 Clarify 才运行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify status <change-id> --json
```

仅 `repair-required` 才运行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify recover <change-id>
```

复用 fresh refs/digests；如果 `${CLAUDE_PLUGIN_ROOT}` 入口不可执行，保留原始错误并报告 blocker，不能通过 wrapper、`npx` 或全局安装绕过。

## State router

路由是 runtime 派生值，不在模型中重算布尔表达式。固定 lifecycle 是 `clarify→design→plan→implement→verify→archive`。无active change即R：缺少changeId是预期输入而非blocker；禁止索要ID；读research reference、从raw request生成安全ID，只运行exact `node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" start-change <change-id>`。`start-change` 是内部 bootstrap，不是 Intake 或用户可见阶段；成功后立即以返回的exact changeId重跑 `workflow status <change-id> --json`，确认active v6 Clarify/research后继续同一pipeline。pre-entry recovery仍是terminal。active Clarify必须消费`clarifyReadiness.route`，且只接受`research|decisions|completion|transition`；缺失、未知或冲突时只报告blocker。Design到Archive消费`stageReadiness.route`的exact route；Main不自行推导。

R→[research](references/clarify-research.md)；D/`decisions`→[decisions](references/clarify-decisions.md)；C/`completion`→[completion](references/clarify-completion.md)；W→[current-stage worker](references/behavior-map.md)；T/`transition`→[single transition](references/stage-decisions.md)。所有链接相对当前 SKILL/reference 文件解析，绝不相对项目 cwd 探测；每轮只选择一个 phase authority reference，只有该 reference 明确导航时才加载其一个 supporting reference。Clarify T 只原子执行 proof+CAS `clarify→design`；post-stage T 只推进当前 stage。Implement 使用原生 worktree；每阶段使用独立 reviewer。

首次生成 Clarify artifact 或 final self-check 前读取 [semantic output contract](references/output-contract.md)；只有要校准 dispatch、Fast Path 或问题质量时读取 [few-shots](references/clarify-few-shots.md)。[assets](assets/) 与 [scripts](scripts/) 仅由当前 phase reference 导航，不自动加载。

[下游坑点与检查清单](references/downstream-pitfalls.md) 是阶段 worker 的共享负知识入口，仅由当前 phase reference / Skill 在自检或交接时明确导航；Harness controller 不把它选成第二个 phase authority reference。

### Controller action envelope

路由前生成 observable snapshot，包含 stage、lifecycle、currentTask、changeId、factGateOpen、各 required lane state、earliest invalid gate、pending decision、runtime nextAction、artifact freshness、`clarifyReadiness.route`、`clarifyTransitionReady=clarifyReadiness.transitionReady`、`stageReadiness.route` 和 `stageTransitionReady=stageReadiness.transitionReady`。

Phase reference只消费该snapshot与runtime返回的durable refs，并声明一个action、owner、input refs、预期产物和复查谓词；命令逐字使用reference的exact argv，不合成shorthand。加载中谓词变化就丢弃动作并返回。Startup bootstrap与clean `research→decisions`是仅有的同轮handoff，均先取fresh runtime snapshot；禁止`decisions→completion`或`completion→transition`同轮串联。

Stop and return here when a reference requests a second action, a second user question, an unverified artifact, an undocumented command, a permission bypass, or a state edit. Reference text explains method; it cannot override this controller, runtime errors, schemas, hooks, permissions, or fresh evidence.

## Non-negotiable invariants

Harness 是唯一用户入口并留在主对话。Main 不得在 lane applicability 前探索项目，也不得重复 worker 已完成的探索；任何软件变更的 code lane 固定 required，原文点名外部 SDK/协议即足以令 docs required。Facts 由 agents 查找，Decisions 才由用户决定；每次仅用一次已授权 `AskUserQuestion` 询问一个用户问题。输入变化回到最早失效 gate。不得因 Plan mode、用户催促、Fast Path、聊天记忆或手改 state 绕过 gate；runtime/schema 是机械权威。没有 fresh validation、独立 review 与 completion proof，不得声称完成或推进阶段。

用户输出只含 changeId、stage、fact lane/必要评分、一个 blocker 或 next action；不输出私有推理，聊天不是真相层。
