# Requirements

- Target：订单服务增加取消接口。
- Scope：仅待支付订单；记录原因；不处理退款。
- Actor：已认证的订单所有者。
- API：`POST /api/orders/{id}/cancel`。
- Data：写取消原因和时间，不新增表。
- Acceptance：待支付成功；其他状态返回稳定冲突错误；重复请求幂等。
- Constraints：兼容现有订单查询。

七维评分均为 4 或 5，用户已确认 scope。
