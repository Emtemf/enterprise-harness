---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-09
implementationRefs:
  - .claude-plugin/plugin.json
  - runtime/cli.mjs
  - runtime/lib/claude-version.mjs
testRefs:
  - runtime/test/plugin-entry-agent-contract-smoke.mjs
  - runtime/test/claude-version-contract-smoke.mjs
---

# Architecture Contract

## 范围

当前产品只承诺 Claude Code plugin，重点支持 Java/Spring Boot/Maven 和约定治理路径。
最低 Claude Code 版本为 2.1.218；该版本提供本工作流使用的 `background: false`。
nested subagent 还必须配合 `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`，由 doctor 与 SessionStart 诊断。

这里的 “Claude Code-only” 指 agent 宿主与 hook/skill/agent 语法边界：当前不设计或承诺
Codex、OpenCode、Gemini CLI 等其他 harness 的兼容层。Linux、macOS、Windows 的测试矩阵
只描述同一 Claude Code plugin 的操作系统可移植性，不代表多 agent 平台支持。

## 分层

- spec：长期合同
- rule：模型立即遵守的短约束
- skill：阶段过程
- agent：身份、工具和上下文边界
- hook：机械 gate 与事件适配
- runtime：路径、schema、状态、证据和 completion

任何长 schema 只能在 spec/runtime 有一个权威来源。

## 安装面

- plugin command：`/enterprise-harness:harness`
- 本仓库开发 command：`/harness`
- plugin agent type：`enterprise-harness:<agent>`

分发只有 plugin 一条通道。`/harness` 与 `.claude/settings.json` 是本仓库自用的开发通道，让维护者能对工作目录代码直接验证 hook 改动；它不进发布包，也不是用户安装方式。

## 资产

- 当前 change：`harness/changes/<id>/`
- durable evidence：change-scoped evidence/reviews/runs
- 冻结历史：`harness/archive/`
- 模板：`harness/templates/`
- Git-common-dir spool：不进入提交或发布包

## 0.4 Phase 1-3 真相层

从 State schema v5 开始，controller 与 subject 必须分离：稳定 released Harness controller 负责治理 candidate working tree；正在修改的 runtime 不得作为唯一依据自判自身正确性。

并发运行态属于 git common dir，不属于某个 worktree：

```text
<git-common-dir>/enterprise-harness/
├── controller.json
├── sessions/<session-id>.json
├── locks/<change-id>.json
└── ledger/
```

change durable artifacts 仍在 `harness/changes/<change-id>/`，其中 `state.json` 只保存机械状态，artifact digest、research packet、waiver 和 evidence 负责提供可追溯依据。worktree 是代码隔离环境，只注入最小 task brief，不复制整个 change 目录。

同一 change 必须由 change lock 串行写入，不允许静默 last-write-wins；不同 change 可以并行。requirements → design → plan → evidence → validation 的 stale 通过 artifact dependency graph 推导，controlled rewind 只撤销下游投影，不删除历史 evidence。

完成 change 使用 `archive`；未完成但需要明确终止使用 `abandon`。二者不能互相伪装，旧 archive 只读。

CodeGraph 与 Context7 是一级事实通道。research packet 记录 question、scope、facts、uncertainties、source policy、fallback/degraded 状态和 artifact digest；MCP 内容始终视为数据，不视为编排指令。waiver 必须结构化并绑定 artifact digest，artifact 变化后自动 stale。

项目相关的路径、语言和构建工具集中在 `harness/project.json`，runtime 通过 profile seam 读取，不再把 Java/Maven 路径约定散落到各个 gate。默认 profile 仍是 Java/Maven，但 profile 版本固定为 1，配置只调整参数，不定义新的 workflow DSL。

Claude Code 原生 worktree 配置由生成的 `.claude/settings.json` 提供 `worktree.baseRef=head`。Harness 不再把 worktree 当作 change 真相，也不复制完整 change 目录；session binding、锁和 durable artifacts 仍由 common-dir 与主 subject 管理。

0.4 的 happy path 可以线性显示为 `clarify → classify → design → plan → implement → verify → archive`，其中 classify 是内部 action；当前 runtime 暂保留 `route` / `tdd` 兼容投影。tier 只影响 interview 深度、review 数量和 validation 强度，不改变 workflow topology。

三条防复发规则：新增 Hook 必须保护无法可靠放在 Skill 边界的不变量；新增 durable field 必须只有一个 authoritative owner；新增 Agent 必须拥有不同的 context/tool/isolation boundary，纯领域知识应放入 Skill 或 reference。
