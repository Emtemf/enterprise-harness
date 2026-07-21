# GUIDE.md — clarify-first-staged-orchestrator 导航卡

> 本文件是这个 change 的**导航卡**：干活时一直要遵守的约束 + 验收入口。
> 它**不复述**本次具体需求(那在 `change.md`) —— 只回答"边界是什么、怎么算完成、去哪验"。
> 边界原则:`change.md` = 本次做什么(会变);本文件 = 一直遵守的约束与验收(稳定)。

## 愿景(本 change 在整体中的位置)

把 Enterprise Harness 收敛成 **Claude Code-only 的 clarify-first staged orchestrator**:
用户只从 `/harness` 进入,系统先探索再强制澄清,歧义足够低且用户确认后自动推进
`clarify → route → design → plan → tdd → verify → archive`,每阶段有模板、gate、durable artifact。

上位约束见根 `CLAUDE.md` 的"设计谱系" —— 第一性目标是**给弱模型兜底**,SOP 的厚度不得削薄。

## 做什么(本 change 的边界内)

- 单一前门 `/harness`;clarify 升级为强制第一阶段(苏格拉底 + ambiguity scoring)
- 冻结 `clarify → … → archive` 阶段状态机与推进 contract
- design 阶段强制覆盖接口 / SQL·数据 / 架构边界 / 测试策略
- requirements/design/tasks/validation/reviews/state 落 repo,不藏 prompt/chat
- 高噪声探索下沉为 read-only subagent,主 orchestrator 只消费压缩结论

## 不做什么(越界即停,先回 clarify)

- 不做 Codex / Pi / Cursor 多宿主 packaging-first 重构
- 不把 `harness/plugin/manifest.json` 升格为官方 plugin API 代理
- 不一次性重写全部 runtime 行为 / 全部 skill·command·hook
- 不把全部 transcript 落入 repo durable truth

## 编码规范(几句话)

- Java 四层:`interfaces → application → domain`,`infrastructure → domain`;跨层用 MapStruct
- 探索 **codegraph-first**,失败才 fallback 且留痕;查文档 **Context7-first**
- 无 RED 证据不得改生产源码;测试 BDD 命名 + `@DisplayName`
- 单 writer:同一时刻只有一个实现者改业务源码,reviewer/explorer 只读

## 验收标准(必须机械可验,不是散文)

本 change 为 L3,`architecture=yes / rule=yes`,完成态 = `VALIDATED`,需同时满足:

1. 阶段状态机 + clarify/design/plan/tdd/verify 模板与推进 contract 已冻结
2. blocking reviewer verdict 齐全且非 block:`design-reviewer`、`plan-critic`、`verification-reviewer`(逐 task)
3. validation 证据 fresh(digest 有效、`validatedAt` 非空)
4. 下列命令全部 passed(见 `validation.md` 完整清单)

## 怎么验收(直接可跑的命令)

```bash
# 从 repo 根运行
# 1. 契约总检 + 环境体检
node harness/plugin/runtime/cli.mjs verify
node harness/plugin/runtime/cli.mjs doctor

# 2. 本 change 关键 contract smoke(TDD 三态脚本,验收用 verify 模式)
node harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs verify
node harness/plugin/runtime/test/staged-template-smoke.mjs verify
node harness/plugin/runtime/test/harness-stage-router-smoke.mjs verify
node harness/plugin/runtime/test/workflow-state-contract-smoke.mjs verify
# 完整 14 条命令清单见本目录 validation.md 的 "Commands Executed"

# 3. 查看权威状态(动态真相,勿以本卡为准)
node harness/plugin/runtime/lifecycle.mjs show-active
```

> 已知坑:部分 `workflow-*-smoke` 会写真实仓库的 active change 状态,
> 跑完用 `git checkout -- harness/changes/` 复位。

## 业务知识沉淀(去哪读)

- 本次需求全文与路由:`change.md`
- 需求澄清结果:`requirements.md`
- 设计:`design.md` | 计划:`tasks.md` | 验证证据:`validation.md`
- reviewer verdict:`reviews/*.json`
- 稳定规范:`harness/specs/staged-workflow.md`、`ambiguity-scoring.md`、`exploration-packet.md`、`context-packet.md`
