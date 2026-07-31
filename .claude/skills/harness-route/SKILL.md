---
name: harness-route
description: Enterprise Harness route 阶段。消费已确认 requirements，确定 tier、owning service/module、API/data/architecture/rule 影响与必需 reviewer，并由独立 checker 复核分流决策。
---

# Harness Route

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）在 stage=route 时加载。

route 是独立 gate，不是 clarify 的尾巴。clarify 回答“需求是什么”，route 回答“这件事归谁、有多大、需要谁复核”。

## 前置

- `workflow.clarifyReady=true`
- `workflow.userConfirmedScope=true`

任一缺失则返回 clarify，不在 route 内补澄清。

## 输入

- `requirements.md` 与七维评分
- clarify 阶段的 exploration briefs
- 目标项目分层与既有模块边界

## 必须确定

- tier：L0/L1/L2/L3
- owning service / module / 业务域
- 影响矩阵：API、data、architecture、rule
- non-goals
- 必需 reviewer
- 下一阶段入口

## 执行

1. 事实不足时派 `enterprise-harness:code-explore` 补齐归属与影响面，不推测。
2. 派 `enterprise-harness:route-decider` 更新 `change.md` 的路由段与 `state.json` 的 tier/impact 投影。
3. 派 `enterprise-harness:requirement-reviewer` 独立复核分流决策。
4. 向用户展示 tier、影响矩阵与依据，请其确认路由。

## 产出

- `change.md`：初步路由、Router 评分、最终路由、影响矩阵
- `state.json`：`tier`、`impact`、`workflow.routeReady`
- executor result 与 checker verdict

## 完成条件

- 四个 impact 维度均已解析，无 `unknown`
- reviewer verdict 非 block
- 用户确认路由后 `workflow.routeReady=true`

## 阻断

- tier 与影响矩阵不一致
- 明显跨服务 scope explosion 未拆分
- 以 `state.json` 手工字段自证 routeReady
- reviewer block

## 恢复

```bash
enterprise-harness workflow decide <change-id> confirm-route
enterprise-harness workflow decide <change-id> revise-route
```

## 下一阶段

L0 可进入 verify；L1+ 进入 design。长期合同见 `harness/specs/workflow.md`。
