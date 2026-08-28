# 横切质量设计

本参考在 Design 中始终使用，按 classification 和事实决定深度；不适用项写明理由。

## 安全

确认身份、授权边界、敏感数据、输入信任、审计事件和滥用路径。`impact.security=yes` 时必须给出对应 verification；不能只写“沿用现有安全机制”。

## 并发与一致性

确认事务所有权、幂等键、竞争条件、重试语义、消息重复/乱序和失败后的状态。没有并发面时说明调用模型为何排除该风险。

## 可观测性

定义能判定成功、降级和回滚触发条件的日志、指标、trace 或审计事件；避免记录 secrets 和完整敏感 payload。

## 测试设计

从 requirement 和失败路径反推 unit、integration、contract、migration、security 与适用 E2E 场景。每个场景写前置条件、动作和可观察断言；exact argv 和具体浏览器驱动留给 Plan/Verify 冻结。
