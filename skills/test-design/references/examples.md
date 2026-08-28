# Test Design 示例

以下只演示合同形状，不是可复用业务答案。

```markdown
## Coverage Matrix
| Source | Concern | Criticality | Applicability | Covered By | N/A Reason |
|---|---|---|---|---|---|
| R1 | 取消订单成功 | high | applicable | TC1 | - |
| VO1 | 重复取消造成二次状态变更 | critical | applicable | TC2 | - |
| migration | 数据迁移 | normal | N/A | - | 本变更不修改 schema |

## 测试用例
| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |
|---|---|---|---|---|---|---|---|---|---|
| TC1 | R1 / D1 / VO1 | integration | high | 订单状态为 pending | 唯一订单 order-101 与取消原因 customer-request | 提交一次取消请求 | 响应状态为 cancelled 且持久化原因等于 customer-request | 删除 order-101 并确认无事件残留 | accepted |
| TC2 | R1 / D1 / VO1 | contract | critical | order-102 已完成一次取消 | 与首次相同的幂等键 cancel-102 | 再次提交相同取消请求 | 状态仍为 cancelled 且只存在一条取消事件 | 删除 order-102 与 cancel-102 幂等记录 | accepted |
```

无效形状及原因：

- `TC1 / R1 / V1`：Traces 混入未声明类型且缺少 `D* / VO*`。
- `CASE-1`、`TC0` 或重复 `TC1`：ID 不稳定。
- `Level=system`、`Priority=urgent`、`Status=draft`：枚举不在合同内。
- `Observable assertions=验证成功`：没有可判定的值、状态、错误或副作用。
- `N/A` 且理由为空：无法审计不适用结论。
- E2E 标记 applicable 但没有 journey：用户路径覆盖缺失。
