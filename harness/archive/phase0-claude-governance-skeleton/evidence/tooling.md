# Tooling Evidence

## codegraph

- status: ready
- action: 已执行 `codegraph init`，当前项目生成 `.codegraph/` 索引；`codegraph status` 显示 19 files / 145 nodes / 215 edges，index up to date
- MCP: `claude mcp list` 显示 `codegraph: codegraph serve --mcp - ✔ Connected`
- sample query: “How does the current harness reference service expose the cancel order API flow from controller to application to domain to persistence?”
- implication: 后续 intake 已可真正执行 codegraph-first，而不是只停留在声明层

## Context7

- status: usable-via-cli
- action: 项目级 `.mcp.json` 已声明 `https://mcp.context7.com/mcp`
- MCP: `claude mcp list` 显示 `context7 - ⏸ Pending approval`
- env: 当前缺少 `CONTEXT7_API_KEY`，因此 MCP 路径尚未形成可用连接
- CLI: `npx ctx7 docs /react/react "useEffect examples"` 已成功返回文档内容；说明当前项目至少具备 Context7 CLI 可用路径
- implication: 现阶段应采用“Context7 MCP 优先，审批/密钥未就绪时回退到 ctx7 CLI”的可用策略
