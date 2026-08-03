# Capability Delta

## MODIFIED Requirements

### Requirement: 应用层只暴露 application 结果模型
当前 `reference-service` 的取消订单用例不得再由 application 层直接返回 interface 响应 DTO。应用层 MUST 只暴露 application 自有结果模型，再由 interface 层负责映射为 HTTP 响应。

#### Scenario: 取消订单用例返回应用层结果
- GIVEN interface controller 调用取消订单用例
- WHEN application 完成取消订单流程
- THEN use case 返回 application 结果模型
- AND interface 层负责将该结果映射为 HTTP response

### Requirement: repository port 不得定义在 infrastructure 包
当前 `reference-service` 的订单仓储接口 MUST 从 infrastructure 包迁出，并成为 inward-facing port，由 infrastructure 负责实现。

#### Scenario: application 仅依赖 inward port
- GIVEN application service 需要加载和保存订单
- WHEN 读取或保存领域对象
- THEN application 只依赖 inward port 抽象
- AND 不直接 import infrastructure 包

### Requirement: domain policy 保持框架无关
当前 `reference-service` 的 domain policy MUST 不依赖 Spring 注解。

#### Scenario: domain policy 不依赖 Spring
- GIVEN 取消订单规则由 domain policy 表达
- WHEN 查看 domain policy 源码
- THEN 不存在 Spring stereotype 注解
- AND policy 仍能被上层组合使用

## Compatibility

- HTTP path 与 method 本轮不变：仍为 `POST /api/orders/{orderId}/cancel`
- request / response 语义本轮保持一致，仅调整内部边界与映射责任

## Error Contract

本轮补齐当前纵切的最小 error contract：

- `400`：请求体校验失败
- `404`：订单不存在
- `409`：订单状态不允许取消

### Requirement: 取消订单接口应返回稳定的错误响应模型
取消订单接口 MUST 对当前已知错误路径返回稳定且可文档化的错误响应模型，而不是仅在成功路径可描述。

#### Scenario: 订单不存在
- GIVEN 指定 `orderId` 不存在
- WHEN 调用取消订单接口
- THEN 返回 `404`
- AND 返回稳定错误响应模型

#### Scenario: 订单状态不允许取消
- GIVEN 订单处于不可取消状态
- WHEN 调用取消订单接口
- THEN 返回 `409`
- AND 返回稳定错误响应模型

#### Scenario: 请求体校验失败
- GIVEN `reason` 为空白或缺失
- WHEN 调用取消订单接口
- THEN 返回 `400`
- AND 返回稳定错误响应模型

## Out of Scope

- 本轮不引入新的业务功能
- 本轮不同时落地 ArchUnit、JaCoCo、真实 HTTP API E2E
- 本轮不一次性完成全部 MapStruct / OpenAPI / 测试规范升级
