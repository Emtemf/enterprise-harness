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
| Requirement | Decision | Evidence | Verification | Rollback |
|---|---|---|---|---|
| R1 | D1 | E1 | V1 | RB1 |

## 测试设计
| VID | 层级 | 场景/前置条件 | 可观察断言 | 后续冻结入口 |
|---|---|---|---|---|
| V1 | integration | 待支付订单发起取消 | 状态变为 cancelled 且原因已保存 | Plan exact argv |

## 风险、兼容与回滚
| RID | 触发条件 | 回滚/恢复动作 | 回滚后验证 |
|---|---|---|---|
| RB1 | 取消失败率超过阈值 | 关闭新入口并恢复旧路由 | 旧下单流程无回归 |
```

无效写法包括“R1/R2 已覆盖”“沿用现有架构”“增加相关测试”或只让 requirement ID 在任意段落出现一次。
