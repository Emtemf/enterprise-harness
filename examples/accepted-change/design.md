# Design

Controller 校验身份和幂等键，application service 在单事务内加载订单、执行 domain policy、保存取消原因。冲突返回 `409 ORDER_NOT_CANCELLABLE`，不存在返回 `404 ORDER_NOT_FOUND`。

数据库复用订单表的 `cancel_reason`、`cancelled_at`，为幂等键建立唯一索引；migration 必须支持回滚。测试覆盖 domain、service、HTTP、OpenAPI request/response/error contract。
