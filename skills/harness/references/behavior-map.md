# Capability 与 run 速查

Load when: controller W is true for any active stage in design, plan, implement, verify, or archive that needs one current-stage worker.
Return to controller: after selecting one capability/handoff action for the current stage.

v6 不使用 behavior registry 作为 correctness authority。制品 Skill 通常通过 frontmatter 的 native `agent:`
binding 决定 capability；Implement 是例外：Main 直接派发带 `isolation: worktree` 的命名 implementer，
implementer 通过 `skills:` 预加载重 Implement Skill。这样同时使用官方命名 subagent 的文件隔离和 Skill
方法合同，避免 `context: fork` 路径只隔离上下文却没有应用 agent worktree。runtime 只消费 Handoff v2、
StageResult、ReviewResult、TECPC 与 digest freshness。

| 工作 | Skill | Capability agent | 结果 |
|---|---|---|---|
| 代码事实 | `explore-code` | `enterprise-harness:code-explore` | ResearchPacket |
| 外部文档事实 | `research-docs` | `enterprise-harness:doc-research` | ResearchPacket |
| 架构设计 | `design` | `enterprise-harness:artifact-worker` | architecture StageResult |
| 测试用例设计 | `test-design` | `enterprise-harness:test-design-worker` | test-design StageResult |
| 计划/验证制品 | stage Skill | `enterprise-harness:artifact-worker` | StageResult |
| 产品代码 | `implement` | `enterprise-harness:implementer` | task execution receipt |
| 独立挑战 | `review` | `enterprise-harness:reviewer` | ReviewResult |
| 归档 | `archive` | `enterprise-harness:artifact-worker` | StageResult |

`classification` 是 clarify 后的内部制品；`tdd` 是 task execution strategy。它们不是 v6 lifecycle stage。

## Archive：完整 lineage 封口

命中 Archive worker 时，Main 必须创建只含 canonical refs 的 execute handoff；不能只传 VerifyProof 或
`validation.md`，也不能把聊天摘要塞入 marker：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create \
  <change-id> archive archive execute \
  --input-ref harness/changes/<change-id>/requirements.md \
  --input-ref harness/changes/<change-id>/classification.json \
  --input-ref harness/changes/<change-id>/debt-assessment.json \
  --input-ref harness/changes/<change-id>/project-contract-assessment.json \
  --input-ref harness/changes/<change-id>/evidence/decisions/clarify-decision-snapshot.json \
  --input-ref harness/changes/<change-id>/design.md \
  --input-ref harness/changes/<change-id>/validation.md \
  --input-ref harness/changes/<change-id>/evidence/completion/verify.json \
  --input-ref harness/changes/<change-id>/test-cases.md \
  --input-ref harness/changes/<change-id>/evidence/completion/design.json \
  --input-ref harness/changes/<change-id>/tasks.md \
  --input-ref harness/changes/<change-id>/task-commands.json \
  --input-ref harness/changes/<change-id>/evidence/completion/plan.json \
  --input-ref harness/changes/<change-id>/evidence/completion/implement.json \
  --target "封存从 Clarify 决策到 Verify 的完整摘要绑定证据链"
```

只把 stdout 的一整行 `HANDOFF_INPUT=<canonical-input.json-path>` 原样传给 `enterprise-harness:archive`。
worker 返回后只认 durable result；Main 创建不同 reviewer 的 archive check handoff，输入包含 Archive
StageResult、manifest/attestation 和 StageResult 的全部 artifacts。独立 ReviewResult 通过后只运行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" lifecycle archive-finalize <change-id>
```

不得让 Archive worker 自行 review、persist 第二次或执行物理移动；命令失败时保留 runtime 原始恢复提示。

## Implement：命名 worktree agent + 预加载 Skill

命中 Implement 当前 task 时，Main 创建 `implement.execute-task` Handoff v2，input refs 至少绑定
`state.json`、`tasks.md`、`task-commands.json`、PlanProof、Design 和 test cases。随后通过 Agent tool 派发
`enterprise-harness:implementer`，prompt 必须且只能是该命令输出的一整行：

```text
HANDOFF_INPUT=<canonical-input.json-path>
```

不得调用 `enterprise-harness:implement` Skill 代替命名 agent；该 Skill 被 implementer 的 `skills:`
frontmatter 预加载。Main 在 agent 返回后只认 durable StageResult/canonical receipt，派独立 task review，
再把 receipt 指向的 reviewed worktree changed paths 精确集成到当前 checkout。runtime 在内容未完全一致时
拒绝 Implement CompletionProof；Main 不得用聊天总结或手写 receipt 绕过。

## Design：有序的单动作投影

当 snapshot 明确 `stage=design` 时，Main 先运行 `workflow status <change-id> --json`，只把
`designReadiness.route` 当作唯一 Design next action。Main 不得重算或重新检查文件、prose 或证据状态来
覆盖这个 runtime 派生值。runtime 按下列固定顺序选择第一项并投影 exact route：

1. `missing/stale architecture result → design.produce`
2. `missing/stale architecture review → design.review（review(design)）`
3. `missing/stale ArchitectureProof → design.seal-architecture（design seal-architecture）`
4. `missing/stale test-design result → design.test-cases`
5. `missing/stale test-design review → design.test-cases.review（review(test-design)）`
6. `both chains fresh → design.transition（design transition）`

Main 只 exact-match 当前 `designReadiness.route` 并执行一个动作，然后重新读取 runtime status/snapshot；
不得在同一轮从 execute 级联到 review、seal、第二个 worker 或 transition。第 6 项返回 controller 选择
`stage-decisions.md` 的单一 transition，不能在本 reference 内自行合成 transition argv。

### 1. Architecture execute

命中第 1 项时，Main 从当前 state/status 读取 canonical `requirements.md`、`classification-ref` 与
classification 声明的全部冻结输入。不得从聊天补写或省略这些 ref。按下面的 argv 形状创建 execute
handoff；每个额外冻结输入都重复一个 `--input-ref`：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create \
  <change-id> design design.produce execute \
  --input-ref harness/changes/<change-id>/requirements.md \
  --input-ref <classification-ref> \
  --input-ref <each-additional-frozen-input-ref> \
  --target "为已批准 requirements 生成摘要绑定、可独立评审的 Design 制品"
```

若没有额外冻结输入，省略最后一个 `--input-ref`，不能把占位符作为真实 argv。创建成功后只取 stdout
中的一整行 `HANDOFF_INPUT=<canonical-input.json-path>`，把它不变地作为 `$ARGUMENTS` 调用
`enterprise-harness:design`。不得附加对话摘要、用户原话或 Main 自己推断的设计内容；forked Skill 只能从
该 marker 解析并读取冻结输入。worker 返回后，以 durable `result.json` 为准继续独立 Review，不能把聊天
返回当作 StageResult。

### 2. Architecture review

命中第 2 项时，只创建绑定 architecture run 的独立 check handoff；reviewer 必须使用新 run，并只消费
frozen refs、architecture StageResult 和 `design.md`：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create \
  <change-id> design design.review check <architecture-run-id> \
  --input-ref harness/changes/<change-id>/design.md \
  --input-ref <architecture-stage-result-ref> \
  --target "独立挑战 Architecture Design 与可验证性义务"
```

只把该命令发出的 `HANDOFF_INPUT=<canonical-input.json-path>` marker 传给 `enterprise-harness:review`。

### 3. Seal ArchitectureProof

命中第 3 项时只运行 proof seal，不派 worker：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" design seal-architecture <change-id>
```

命令非零退出时把稳定错误码与恢复动作返回 controller；不能手写或覆盖
`evidence/completion/design-architecture.json`。

### 4. Test Design execute

命中第 4 项时，从 canonical ArchitectureProof 读取 architecture execute run 的 durable StageResult ref，
并创建 exact `design.test-cases` handoff。requirements、classification、Design、ArchitectureProof 与
architecture StageResult 都必须 digest-bind；每个额外冻结事实输入继续重复 `--input-ref`：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create \
  <change-id> design design.test-cases execute \
  --input-ref harness/changes/<change-id>/requirements.md \
  --input-ref <classification-ref> \
  --input-ref harness/changes/<change-id>/design.md \
  --input-ref harness/changes/<change-id>/evidence/completion/design-architecture.json \
  --input-ref <architecture-stage-result-ref> \
  --input-ref <each-additional-frozen-input-ref> \
  --target "基于已评审 Architecture Design 生成摘要绑定、可独立评审的 test-cases.md"
```

若没有额外冻结输入，省略最后一个 `--input-ref`，不能把占位符作为真实 argv。创建成功后，Main 为
test-design worker 只取 stdout 中的一整行 `HANDOFF_INPUT=<canonical-input.json-path>`，把它不变地作为 `$ARGUMENTS` 调用 `enterprise-harness:test-design`。不得附加聊天摘要、用户原话或 Main 自己推断的测试内容；worker 返回后只认 durable `result.json`。

### 5. Test Design review

命中第 5 项时只创建绑定 test-design run 的独立 check handoff：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create \
  <change-id> design design.test-cases.review check <test-design-run-id> \
  --input-ref harness/changes/<change-id>/test-cases.md \
  --input-ref <test-design-stage-result-ref> \
  --target "独立挑战 Test Design 的覆盖、可证伪性与执行边界"
```

只把该命令发出的 marker 传给 `enterprise-harness:review`；selector 必须按 exact
`design.test-cases.review` 冻结 `test-design` 与适用 risk rubric IDs。

## Plan：双产物与独立评审

`plan.produce` 只创建 execute handoff，至少 digest-bind requirements、classification、design、test-cases 与 compound DesignProof；marker 原样传给 `enterprise-harness:plan`。`plan.review` 只创建绑定 execute run 的 check handoff，输入包含 `tasks.md`、`task-commands.json`、Plan StageResult 和所有 execute frozen refs；marker 原样传给 `enterprise-harness:review`。两者都完成后 runtime 才投影 `plan.transition`。

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create <change-id> plan plan.produce execute --input-ref harness/changes/<change-id>/requirements.md --input-ref <classification-ref> --input-ref harness/changes/<change-id>/design.md --input-ref harness/changes/<change-id>/test-cases.md --input-ref harness/changes/<change-id>/evidence/completion/design.json --target "把已批准 Design 与 Test Design 冻结为可独立执行的任务和 literal argv"
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create <change-id> plan plan.review check <plan-run-id> --input-ref harness/changes/<change-id>/tasks.md --input-ref harness/changes/<change-id>/task-commands.json --input-ref <plan-stage-result-ref> --target "独立挑战任务切片、策略、TC 映射、literal argv 与写入范围"
```

## Implement：执行、评审、受治理集成

`implement.execute-task` 按上文命名 worktree agent 合同执行；`implement.review-task` 创建不同 reviewer 的 check handoff。runtime 投影 `implement.integrate-task` 后，Main 只能运行下列命令；它会重验 execute/review identity、receipt、write scope、git common dir 和 worktree digest，并对 changed paths 逐一原子复制或删除。不得用 `cp`、`git checkout` 或聊天摘要代替。

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create <change-id> implement implement.execute-task execute --input-ref harness/changes/<change-id>/state.json --input-ref harness/changes/<change-id>/tasks.md --input-ref harness/changes/<change-id>/task-commands.json --input-ref harness/changes/<change-id>/evidence/completion/plan.json --input-ref harness/changes/<change-id>/design.md --input-ref harness/changes/<change-id>/test-cases.md --target "在隔离 worktree 按冻结策略完成当前 task 并生成 canonical receipt"
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create <change-id> implement implement.review-task check <execute-run-id> --input-ref harness/changes/<change-id>/state.json --input-ref harness/changes/<change-id>/tasks.md --input-ref harness/changes/<change-id>/task-commands.json --input-ref harness/changes/<change-id>/evidence/tasks/<task-id>.json --input-ref <implement-stage-result-ref> --target "独立审查当前 task 的冻结合同、receipt 与 reviewed worktree diff"
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" task-integrate <change-id> <task-id> <execute-run-id>
```

`implement.select-task` 只运行 `node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" lifecycle current-task <change-id> <next-task-id>`；随后结束本轮。只有全部冻结 task 都已执行、独立评审且精确集成，runtime 才投影 `implement.transition`。

## Verify：新鲜执行证据与最终评审

`verify.produce` 创建 exact `verify.collect` execute handoff，必须 digest-bind `test-cases.md`、DesignProof、`tasks.md`、`task-commands.json`、PlanProof 与 ImplementProof，marker 原样传给 `enterprise-harness:verify`。`verify.review` 创建绑定 Verify StageResult、`validation.md` 及逐 TC receipts 的 check handoff，marker 原样传给 `enterprise-harness:review`。只有独立 final review 通过才投影 `verify.transition`。

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create <change-id> verify verify.collect execute --input-ref harness/changes/<change-id>/test-cases.md --input-ref harness/changes/<change-id>/evidence/completion/design.json --input-ref harness/changes/<change-id>/tasks.md --input-ref harness/changes/<change-id>/task-commands.json --input-ref harness/changes/<change-id>/evidence/completion/plan.json --input-ref harness/changes/<change-id>/evidence/completion/implement.json --target "按 accepted TC 重跑冻结命令并生成新鲜 validation 与机器证据"
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" handoff create <change-id> verify verify.review check <verify-run-id> --input-ref harness/changes/<change-id>/validation.md --input-ref <verify-stage-result-ref> --input-ref <each-canonical-TC-receipt-ref> --target "独立挑战最终验证覆盖、证据新鲜度与可观察验收"
```

## Archive route

`archive.produce` 使用本文件顶部的完整 lineage handoff；`archive.review` 创建绑定 Archive StageResult、manifest、attestation 和全部 StageResult artifacts 的独立 check handoff；`archive.finalize` 返回 controller，执行 `stage-decisions.md` 的唯一 finalize 命令。
