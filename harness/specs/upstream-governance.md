# 上游升级治理规范

## 目标

明确本项目如何处理对上游项目的“参考关系”和“运行时依赖关系”，避免上游升级后当前 Harness 被动失效。

## 上游分类

### A. 参考型上游（reference upstream）
这些项目当前主要贡献方法、目录思想或工作流灵感，不应被当成安装时必须同步的运行时依赖：

- Superpowers
- OpenSpec

对它们的关系是：

- 借方法，不直接依赖其运行时
- 借资产模型，不直接跟随其目录或命令面自动升级
- 仓库内一旦内化为我们的规则 / 模板 / spec，就应由本项目自行维护

### B. 运行型上游（runtime upstream）
这些项目当前会直接影响安装者的可执行路径：

- CodeGraph
- Context7 CLI / MCP

对它们的关系是：

- 需要记录当前已验证版本
- 需要有本机 doctor / upstream check
- 需要设计升级后兼容/降级策略

## 原则

1. 不把参考型上游的最新文档自动当成当前项目真相。
2. 只有在人工审查后，才把上游变化内化到本项目 contract。
3. 运行型上游必须区分：
   - 当前已验证版本
   - 当前本机实装版本
   - 上游最新可获取版本
4. 参考型上游升级时，默认触发“人工比对 + selective adoption”，而不是自动同步。
5. 运行型上游升级时，默认触发“兼容性检查 + doctor / sync / migrate”。

## 当前策略

### Superpowers
- 当前为参考型上游
- 主要借用：brainstorming / planning / TDD / verification 思路
- 不把其技能目录结构、运行时插件状态、Git worktree 假设当成当前项目强依赖
- 若上游发布新版本，应重新评估：哪些方法仍值得保留、哪些不再适用

### OpenSpec
- 当前为参考型上游
- 主要借用：change/spec/archive 资产模型
- 不自动跟随其 OPSX / CLI 命令升级
- 若上游 workflow、schema 或 archive 语义变化，只在人工确认后选择性吸收

### CodeGraph
- 当前为运行型上游
- 需要记录：当前本机版本、doctor 检查结果、索引是否可用
- 升级后必须重新验证：codegraph-first、index init、doctor 输出、关键探索查询

### Context7
- 当前为运行型上游
- 当前项目主路径是 CLI wrapper，不依赖待审批 MCP
- 升级后必须重新验证：library resolve、docs query、CLI wrapper、local adapter env var 提示

## 升级工作流

### 参考型上游升级
1. 记录上游版本/变更
2. 阅读 release notes / docs 变化
3. 比较哪些内容只是“上游新风格”，哪些是“本项目必须吸收的能力变化”
4. 仅在需要时更新本项目：
   - `harness/specs/`
   - `.claude/rules/`
   - `.claude/skills/`
   - README / roadmap
5. 不因为上游改名就盲目跟着改我们的术语

### 运行型上游升级
1. 记录当前版本与目标版本
2. 在本机执行 doctor / upstream-check
3. 运行最小 smoke tests
4. 若行为变化，更新：
   - runtime wrappers
   - local adapter schema
   - migrate / upgrade skeleton
   - README / CONTRIBUTING
5. 通过后再更新 registry

## 必须保留的仓库资产

- `harness/upstream/registry.json`
- runtime `upstream-check` 命令
- README 中的当前上游关系说明
- 路线图中的升级策略说明

## 结论

上游项目升级不是“自动同步问题”，而是“分类治理问题”：

- 参考型上游：以人工吸收为主
- 运行型上游：以版本盘点、doctor、兼容检查和迁移脚手架为主
