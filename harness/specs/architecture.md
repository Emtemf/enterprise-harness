---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - .claude-plugin/plugin.json
  - harness/plugin/runtime/cli.mjs
testRefs:
  - harness/plugin/runtime/test/plugin-entry-agent-contract-smoke.mjs
---

# Architecture Contract

## 范围

当前产品只承诺 Claude Code plugin 与 standalone checkout，重点支持 Java/Spring Boot/Maven 和约定治理路径。

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
- standalone command：`/harness`
- plugin agent type：`enterprise-harness:<agent>`

plugin 与 standalone 共享 runtime；只允许入口变量和安装位置不同。

## 资产

- 当前 change：`harness/changes/<id>/`
- durable evidence：change-scoped evidence/reviews/runs
- 冻结历史：`harness/archive/`
- 模板：`harness/templates/`
- Git-common-dir spool：不进入提交或发布包

## 非目标

不替代 CI/CD、人工 review、安全平台、权限系统或生产发布审批。
