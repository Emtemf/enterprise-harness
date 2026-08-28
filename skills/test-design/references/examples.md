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
- `Observable assertions=验证成功 1` 或 `接口可用 \"ok\"`：数字/literal 没有与响应、返回、状态码、字段值或数量建立关系；`响应为200且成功` 则可判定。
- `Actions=make test`、`用户执行 run-all-tests --critical` 或 `用户执行 curl https://service.test`：Actions 不是中文业务动作或 HTTP method+path，而是在选择执行命令。
- candidate 任意位置的 `exact argv: [\"npm\",\"test\"]`、shell-language fence 或 `使用 Playwright 执行测试` 都是显式越界；`重启 Node 服务`、前置条件 `Node 服务已启动` 与数据章节的 JSON code fence 合法，裸技术名不作为执行证据。
- `N/A` 且理由为空：无法审计不适用结论。
- E2E 标记 applicable 但没有 journey：用户路径覆盖缺失。
