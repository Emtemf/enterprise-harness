# Capability 与 run 速查

Load when: controller W is true for any active stage in design, plan, implement, verify, or archive that needs one current-stage worker.
Return to controller: after selecting one capability/handoff action for the current stage.

v6 不使用 behavior registry 作为 correctness authority。Skill 通过其 frontmatter 的 native `agent:` binding 决定 capability，runtime 只消费 Handoff v2、StageResult、ReviewResult、TECPC 与 digest freshness。

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
