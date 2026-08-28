# API 设计条件分支

仅在 `impact.api=yes` 时加载并形成实质内容：

- 外部 API 与内部 service contract 的 owner、调用者和版本边界；
- request/response、状态码、稳定错误码与错误信息暴露边界；
- authentication、authorization、tenant/data scope；
- idempotency key、重复/并发请求、timeout/retry 语义；
- pagination、排序、兼容读取/写入和弃用窗口；
- OpenAPI 与实现保持一致的方式；
- success、validation、auth、conflict、timeout 和兼容边界对应的 `VO*`。

API 决定必须连接到 `R* / D* / E* / VO* / RB*`。不得用 controller 类名或伪代码代替契约。
