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

`classification` 是 clarify 后的内部制品；`tdd` 是 task execution strategy。它们不是 v6 lifecycle stage。
