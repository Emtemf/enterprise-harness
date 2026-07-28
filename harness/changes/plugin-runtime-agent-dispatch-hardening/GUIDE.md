# GUIDE.md — plugin-runtime-agent-dispatch-hardening 导航卡

> 本文件是这个 change 的**导航卡**：干活时一直要遵守的约束 + 验收入口。
> 它**不复述**本次具体需求（那在 `change.md`）——只回答“边界是什么、怎么算完成、去哪验”。
> 边界原则：`change.md` = 本次做什么（会变）；本文件 = 一直遵守的约束与验收（稳定）。

## 机械字段（自动生成）

- change-id: `plugin-runtime-agent-dispatch-hardening`
- tier: `L3`
- impact.api: `no`
- impact.data: `no`
- impact.architecture: `yes`
- impact.rule: `yes`

## 愿景

把 Enterprise Harness 从“强规范、弱运行证明”推进为真实 Claude Code plugin-only 环境可验证的
staged workflow 基线。

## 做什么

- 修复 harness command/skill 入口冲突。
- 统一 plugin-facing scoped Agent subtype。
- 建立 agent-aware exploration/write gate。
- 用可校验 TDD receipt 替代字符串自报。
- 收紧 completion/archive 与 release acceptance。

## 不做什么

- 不新增 fat runtime orchestrator。
- 不修改 reference-service。
- 不发布、不 push。
- 不扩展全部企业设计模板。

## 编码规范（可按需补充）

- 探索 **codegraph-first**，失败才 fallback 且留痕
- 查文档 **Context7-first**
- 无 RED 证据不得改生产源码
- reviewer / explorer 默认只读

## 验收标准

- clean-target `/enterprise-harness:harness` 入口与 scoped agent dispatch 可观测；源码
  standalone `.claude/` 下 `/harness` 仍可用。
- 主线程探索/写入、stage 跳跃、伪 TDD receipt、弱 archive 均有 RED 反例并被阻断。
- Claude plugin validation、关键 smoke、runtime verify 与 live E2E 通过。

## 怎么验收（直接可跑的命令）

```bash
# 从 repo 根运行
node harness/plugin/runtime/cli.mjs verify
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/test/plugin-entry-agent-contract-smoke.mjs verify
node harness/plugin/runtime/test/agent-lifecycle-hook-smoke.mjs verify
node harness/plugin/runtime/test/tdd-receipt-contract-smoke.mjs verify
node harness/plugin/runtime/test/archive-completion-smoke.mjs verify
node harness/plugin/runtime/test/release-version-acceptance-smoke.mjs verify
claude plugin validate .
# 本机已认证时必须执行；CI 通过 HARNESS_LIVE_E2E=1 显式启用
HARNESS_LIVE_E2E=1 node harness/plugin/runtime/test/claude-plugin-live-e2e.mjs verify
node harness/plugin/runtime/lifecycle.mjs show-active
```

## 业务知识沉淀（去哪读）

- 需求与路由：`change.md`
- 需求澄清：`requirements.md`
- 设计：`design.md`
- 计划：`tasks.md`
- 验证：`validation.md`
- 评审：`reviews/*.json`
