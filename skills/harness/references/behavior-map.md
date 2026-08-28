# Capability 与 run 速查

Load when: controller W is true for any active stage in design, plan, implement, verify, or archive that needs one current-stage worker.
Return to controller: after selecting one capability/handoff action for the current stage.

v6 不使用 behavior registry 作为 correctness authority。Skill 通过其 frontmatter 的 native `agent:` binding 决定 capability，runtime 只消费 Handoff v2、StageResult、ReviewResult、TECPC 与 digest freshness。

| 工作 | Skill | Capability agent | 结果 |
|---|---|---|---|
| 代码事实 | `explore-code` | `enterprise-harness:code-explore` | ResearchPacket |
| 外部文档事实 | `research-docs` | `enterprise-harness:doc-research` | ResearchPacket |
| 设计/计划/验证制品 | stage Skill | `enterprise-harness:artifact-worker` | StageResult |
| 产品代码 | `implement` | `enterprise-harness:implementer` | task execution receipt |
| 独立挑战 | `review` | `enterprise-harness:reviewer` | ReviewResult |
| 归档 | `archive` | `enterprise-harness:artifact-worker` | StageResult |

`classification` 是 clarify 后的内部制品；`tdd` 是 task execution strategy。它们不是 v6 lifecycle stage。

## Design worker：唯一合法交接

当 snapshot 明确 `stage=design` 且 `W=true`，Main 先从当前 state/status 读取 canonical
`requirements.md`、`classification-ref` 与 classification 声明的全部冻结输入。不得从聊天补写或省略
这些 ref。按下面的 argv 形状创建 execute handoff；每个额外冻结输入都重复一个 `--input-ref`：

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
