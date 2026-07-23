# GUIDE.md — smoke-fixture-decoupling 导航卡

> 本文件是这个 change 的**导航卡**：干活时一直要遵守的约束 + 验收入口。
> 它**不复述**本次具体需求（那在 `change.md`）——只回答“边界是什么、怎么算完成、去哪验”。
> 边界原则：`change.md` = 本次做什么（会变）；本文件 = 一直遵守的约束与验收（稳定）。

## 机械字段（自动生成）

- change-id: `smoke-fixture-decoupling`
- tier: `L1`
- impact.api: `unknown`
- impact.data: `unknown`
- impact.architecture: `unknown`
- impact.rule: `unknown`

## 愿景（待填）

<!-- 待填：说明本 change 在整体中的位置 -->

## 做什么（待填）

<!-- 待填：列出本 change 的边界内目标 -->

## 不做什么（待填）

<!-- 待填：列出明确非目标/越界项 -->

## 编码规范（可按需补充）

- 探索 **codegraph-first**，失败才 fallback 且留痕
- 查文档 **Context7-first**
- 无 RED 证据不得改生产源码
- reviewer / explorer 默认只读

## 验收标准（待填）

<!-- 待填：用机械可验的标准描述完成态 -->

## 怎么验收（直接可跑的命令）

```bash
# 从 repo 根运行
node harness/plugin/runtime/cli.mjs verify
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs verify
node harness/plugin/runtime/lifecycle.mjs show-active
```

## 业务知识沉淀（去哪读）

- 需求与路由：`change.md`
- 需求澄清：`requirements.md`
- 设计：`design.md`
- 计划：`tasks.md`
- 验证：`validation.md`
- 评审：`reviews/*.json`
