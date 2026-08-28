# Requirement Trace 示例

以下只演示引用闭合，不是可复用业务答案：

```markdown
## 事实与约束
| EID | 来源 | 已确认事实或约束 |
|---|---|---|
| E1 | evidence/code-orders.json | 订单写入由 application service 持有事务 |

## 方案与权衡
| DID | Context（EID） | Decision | Consequences | Status |
|---|---|---|---|---|
| D1 | E1 | 取消用例进入既有 application service | 保持事务所有权，controller 不承载规则 | accepted |

## Requirement Trace
| Requirement | Decision | Evidence | Verification Obligation | Rollback |
|---|---|---|---|---|
| R1 | D1 | E1 | VO1 | RB1 |

## 可验证性义务
| VOID | Requirement / Decision | 必须可观察的行为 | 主要失败信号 | 后续 Test Design 入口 |
|---|---|---|---|---|
| VO1 | R1 / D1 | 取消后订单状态变为 cancelled 且原因已保存 | 状态未变更或原因丢失 | 由 test-design 映射 TC* |

## 风险、兼容与回滚
| RID | 触发条件 | 回滚/恢复动作 | 回滚后验证 |
|---|---|---|---|
| RB1 | 取消失败率超过阈值 | 关闭新入口并恢复旧路由 | 旧下单流程无回归 |
```

无效写法包括“R1/R2 已覆盖”“沿用现有架构”“增加相关测试”或只让 requirement ID 在任意段落出现一次。
