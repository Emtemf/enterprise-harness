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

## 非目标

不替代 CI/CD、人工 review、安全平台、权限系统或生产发布审批。
