# Data / SQL 设计条件分支

仅在 `impact.data=yes` 时加载并形成实质内容：

- schema/table/column/constraint/index 的语义与必要 SQL；
- 事务、锁、隔离级别、并发写和幂等边界；
- expand/migrate/contract 或其他兼容发布顺序；
- backfill 批次、失败恢复、校验和可重入性；
- 新旧版本并存时的兼容读写；
- dry-run、apply、rollback/restore-point 与迁移后验证；
- 数据量、锁表时间、可用性和隐私风险对应的 `VO* / RB*`。

不可逆迁移必须标明恢复点和数据恢复流程，不能写成“执行反向 SQL 即可”。SQL 属于 durable design/plan artifact，不留在聊天中。
