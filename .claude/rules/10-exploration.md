# Exploration

- 代码探索必须派 `enterprise-harness:code-explore` subagent。
- 主 orchestrator 只消费压缩结论，不重复相同探索。
- Java/后端默认 CodeGraph-first。
- fallback 前同一 agent 必须留下 CodeGraph attempt 和原因。
- 外部库、框架、SDK、版本行为默认 Context7-first。
- Context7 默认通过 `.mcp.json` 的 MCP server 查询，并用 `runtime/lib/mcp-policy.mjs` 的 `docs.resolve` / `docs.query` alias；匿名可用，`CONTEXT7_API_KEY` 是可选增强项（更高额度）。
- Context7 MCP 不可用或结果不足时才查官方文档、官方源码或 `enterprise-harness context7 <library|docs>` CLI，并在 packet 中记录 fallback/degraded 原因。
- 一份 exploration brief 只包含 question、scope、facts、uncertainties、impact、sources 和 suggestedUserQuestion。
- Bash 探索豁免按每个目标路径判断；混合业务路径时不能因 README/docs token 整体豁免。

长期合同见 `harness/specs/workflow.md` 和 `harness/specs/agents-and-handoff.md`。
