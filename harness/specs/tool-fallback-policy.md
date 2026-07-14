# 工具 fallback 策略规范

## 目标

保证 codegraph-first 与 Context7-first 不是口号，而是可记录、可验证、可恢复的工具策略。

## codegraph-first

### 默认顺序
1. 确认 codegraph 是否可用
2. 做结构化代码探索
3. 只有在不可用、结果不足或影响面无法覆盖时，才允许 fallback

### 允许的 fallback
- `grep`
- `Read`

### 必须记录
- 失败原因
- 尝试过的查询或工具
- fallback 范围
- 当前可信度

### blocker 规则
- L3 且 codegraph 不可用并且影响面不清：默认 blocker

## Context7-first

### 默认顺序
1. 确认项目实际依赖与版本
2. 默认使用项目包装脚本：`bash harness/bin/context7-library.sh` → `bash harness/bin/context7-docs.sh`
3. 若未来补齐审批与密钥，也可升级为 Context7 MCP 路径
4. 不足时回退到 vendor docs / 官方源码

### 必须记录
- library name
- resolved library id
- version
- query
- 结论
- fallback reason（若有）

## GitHub / Release / PR 页面获取

### 默认策略
1. 对 GitHub 仓库页、PR 页、Release 页、Issue 页与公开 API 数据，优先使用 `gh` CLI 或 GitHub REST API
2. 若只是需要仓库内文件内容，优先使用本地 `Read` / `codegraph` / `git` 信息，而不是把 GitHub 页面当主来源
3. 只有在 `gh` / REST 不可用且确有必要时，才尝试通用网页抓取

### 说明
- 某些环境中，通用网页抓取可能因为 `github.com` 域名安全校验或企业网络策略而失败
- 这类失败不应被误判为“页面不存在”或“仓库不可访问”
- 遇到该情况时，优先改用 `gh repo view`、`gh pr view`、`gh release view`、`gh api` 或 `curl --http1.1` 调 GitHub REST API

### 必须记录
- 尝试过的命令或 API 路径
- 失败原因
- 改用的 fallback
- 当前证据范围

## 权威性层级

1. 当前项目代码与实际依赖
2. 官方 vendor docs / 官方 SDK 文档
3. 官方源码 / Javadoc
4. Context7 返回结果
5. 更广泛网页资料

Context7 是检索适配器，不是最终权威来源。

## 禁止事项

- 不得静默 fallback
- 不得把工具配置存在误当成工具可用
- 不得把空结果直接当成“代码不存在”或“官方没有该行为”
