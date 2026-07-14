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
