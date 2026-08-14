---
name: design
description: 生成 digest 绑定、可评审的技术设计制品。
user-invocable: false
context: fork
---

# Design

根据已确认的 requirements 和 classification 产出 durable design。覆盖适用的接口、错误模型、认证/幂等、数据/SQL、迁移/回滚、兼容性、并发、组件边界与测试。对不适用领域标注 `N/A` 并说明理由。

## Quality loop

写入 self-check artifact，再通过独立 v2 run 请求 independent review。缺少业务决策时 worker 返回 `NEEDS_DECISION`；只有主 Harness 可以向用户提问。