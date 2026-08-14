# 例子

一个有效的 requirement trace：

- `R1`：用户可创建资源。
- 决策：controller 只校验输入并委托 application service。
- 证据：现有 service boundary 与 requirements.md。
- 验证：覆盖成功、授权失败和重复请求的集成测试。
- 回滚：恢复前一版本路由并保留兼容读取窗口。

例子只说明 trace 形状；实际设计必须基于当前 change 的 facts 与 impact。
