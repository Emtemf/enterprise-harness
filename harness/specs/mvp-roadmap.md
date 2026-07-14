# MVP 与迭代路线图

## 目标

明确当前 Enterprise Harness 已经做到哪一层、哪些能力已真实可用、哪些仍是增强项，以及后续迭代优先级。

## 当前 MVP 已完成能力

### 1. Repo Contract
已具备：

- 根 `CLAUDE.md` 中文操作合同
- `.claude/rules/` 自动加载规则层
- `.claude/agents/` reviewer 骨架
- `.claude/skills/harness-intake/` 入口骨架
- `harness/specs/` 稳定规范层
- `harness/templates/` 模板层
- `harness/config.yaml` 项目能力声明

### 2. Tooling
已具备：

- codegraph-first：真实可用
- Context7 CLI wrapper：真实可用
- 项目 `.mcp.json`：当前只保留真实可用的 codegraph MCP 面

### 3. Change Lifecycle
已具备：

- `create-change-scaffold.sh`
- `create-exploration-artifact.sh`
- `update-change-state.sh`
- `set-active-change.sh`
- `show-active-change.sh`
- `set-change-impact.sh`
- `record-review-verdict.sh`
- `mark-change-reviewed.sh`
- `mark-change-validated.sh`

### 4. Validation & Gates
已具备：

- `validate-spec-structure.sh`
- `validate-artifact-state.sh`
- `validate-review-verdicts.sh`
- `validate-change-evidence.sh`
- `full-verify.sh`
- active change 驱动的 pre-write gate

### 5. Portable Runtime Skeleton
已具备：

- `harness/plugin/manifest.json`
- `bootstrap.mjs`
- `doctor.mjs`
- `sync.mjs`
- `install.mjs`
- `setup-local-adapter.mjs`
- `local-adapter.example.json`
- Node runtime hook adapters

## 当前 MVP 尚未完成

以下内容尚未视为 MVP 已交付：

- 真正的 design gate / plan gate / stale validation hard block
- `RED_VERIFIED` 级别的生产源码写入门禁
- ArchUnit 真接入
- JaCoCo 85% 真接入
- 真实 HTTP API E2E
- 完整 OpenAPI 语义硬门禁
- 跨平台 installer 成熟版
- Windows / macOS 真机验证矩阵

## 当前最准确状态

可以把当前阶段定义为：

> **可运行的 repo contract + portable runtime MVP**

它已经适合作为团队共享架子和下一阶段强化的起点，但还不应被描述为完整的企业级强门禁平台。

## 后续迭代优先级

### Iteration 1：状态与门禁收紧
目标：把“可用”变成“更难跑偏”。

优先做：

1. design gate
2. stale validation gate
3. `RED_VERIFIED` 才允许生产源码写入
4. 更明确的 review verdict 消费逻辑

### Iteration 2：Java 黄金样板增强
目标：把 `reference-service` 变成真正可示范的后端样板。

优先做：

1. ArchUnit 接入
2. JaCoCo 85% 接入
3. 真实 HTTP API E2E
4. 更强 OpenAPI 契约校验

### Iteration 3：插件产品化
目标：从“活骨架”走到“更容易装与迁移”。

优先做：

1. machine-local adapter 正式 schema
2. 更完整 installer
3. upgrade / migration 机制
4. Windows / macOS 真机验证

## 团队使用建议

### 现在就可以用来做什么

- 用 harness-intake 入口驱动新 change 落盘
- 用 codegraph-first 探索 Java 结构
- 用 Context7 CLI wrapper 查外部库文档
- 用 active change + pre-write gate 管住受治理路径
- 用 full-verify 检查当前 contract 是否完整

### 现在还不应承诺什么

- 不应承诺“已完整企业级门禁”
- 不应承诺“Windows/macOS 已全量验证”
- 不应承诺“任意 change 都能自动走完整状态机且绝不跑偏”

## 结论

当前版本已经足够作为**团队共享、跨机器可接入、跨会话可恢复**的 MVP。后续重点不再是“有没有骨架”，而是“把门禁再收紧、把安装再产品化、把 Java 质量面再补强”。
