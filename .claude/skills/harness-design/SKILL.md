---
name: harness-design
description: Enterprise Harness design 阶段。把已确认 requirements 转成接口、错误、数据/SQL、架构、兼容性和测试设计，并要求独立 design reviewer。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness Design

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

## 上下文边界

你在 forked subagent 中运行，没有主会话历史，也没有和用户对话的通道。

- 权威输入只有 change 目录里的 durable artifact，不是聊天记录。
- 需要用户决策时在 blockers 里写明，交主 orchestrator 去问。
- 你仍可派 executor 和 checker subagent，这是本阶段的核心要求。
- 返回给主 orchestrator 的是压缩结论，不是设计全文。

## 输入

- approved requirements + scope confirmation、tier、impact
- relevant code/doc exploration（exploration packet）
- `harness/templates/design.md`（设计模板）

## 动作

1. 若接口、数据或调用方事实不足，先生成 exploration brief：
   - 代码事实：`design.explore-code` execute（`enterprise-harness:code-explore`）→ check（`design-reviewer`）
   - 外部资料：`design.research-docs` execute（`enterprise-harness:doc-research`）→ check（`design-reviewer`）
2. 创建 execute handoff，派 `design-executor`：
   ```bash
   enterprise-harness handoff create <change-id> design design.produce execute
   ```
3. 等 `design.produce/result.json`，以其 runId 创建 check handoff，派 `design-reviewer`。
4. API 有变化时，对 `design.check-api` 走 execute（`design-executor`）→ check（`api-consistency-reviewer`）。
5. blocker 修复后使用新 run 重审，不复用旧 runId。

## 设计必须覆盖的维度

| 维度 | 必需条件 |
|------|---------|
| goals / non-goals | 明确范围边界 |
| component boundaries | 分层依赖方向（domain 不依赖 Spring/DB/HTTP） |
| API request/response/error | path、method、DTO、HTTP status、错误码 |
| auth / idempotency | 鉴权方式、幂等键 |
| caller compatibility | 不破坏已有合同 |
| schema / SQL / index | 表结构、索引策略 |
| migration / rollback | 迁移脚本、回滚路径 |
| concurrency / transaction | 隔离级别、锁策略 |
| test strategy | 单元、集成、契约测试点 |
| observability | 日志、指标、trace 锚点 |

不适用的维度需在设计中显式标注 N/A 并说明原因。

## 产出

- `design.md`（完整设计文档）
- exploration refs（适用时）
- `design.produce` result.json + `design-reviewer` check.json
- `design.check-api` result.json + `api-consistency-reviewer` check.json（适用时）

## 阻断条件

- requirements 未确认
- API 或 data 适用但未设计
- 只有文字描述，无可验证取舍（如"考虑加索引"）
- reviewer 非 pass

## 下一阶段

design pass 后，主 orchestrator 执行：

```bash
enterprise-harness workflow decide <change-id> approve
```

此命令置 `designApproved=true` 并推进到 plan 阶段。漏执行会使 gate 保持 false，链路卡在 design。
