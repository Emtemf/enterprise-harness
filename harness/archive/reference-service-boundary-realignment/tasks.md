# Tasks

### Task 1: 引入 domain repository port、application result DTO，并保持 controller 编译通过

**Files**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/repository/OrderRepository.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/dto/CancelOrderResultDto.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/CancelOrderUseCase.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/OrderCancellationService.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/application/OrderCancellationServiceTest.java`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`

**Consumes**
- `OrderRecord cancel(String reason)`
- `boolean canCancel(OrderStatus status)`

**Produces**
- `CancelOrderResultDto cancel(String orderId, String reason)`
- `com.example.orders.domain.repository.OrderRepository`
- controller 通过最小显式映射继续输出既有 HTTP response

- [ ] 写失败测试
  - 先把 `OrderCancellationServiceTest` 改为 import `application.dto.CancelOrderResultDto` 与 `domain.repository.OrderRepository`
  - 把断言结果类型改为 `CancelOrderResultDto`
- [ ] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationServiceTest test`
  - Expected failure: 缺少 `CancelOrderResultDto` 与 `domain.repository.OrderRepository`，或 `CancelOrderUseCase` / `OrderCancellationService` 仍返回旧 transport DTO
- [ ] 实现最小 GREEN 改动
  - 创建 domain repository port
  - 创建 application result DTO
  - 更新 `CancelOrderUseCase` 与 `OrderCancellationService` 返回 application result DTO
  - 在 controller 中加入最小显式映射，保证主源码编译与现有 HTTP response 语义保持不变
- [ ] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationServiceTest -Dtest=OrderCancellationControllerIntegrationTest test`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

### Task 2: 让 controller 适配 application result，并把 domain policy 装配移回 composition root

**Files**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/config/OrderDomainConfiguration.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/domain/OrderCancellationPolicy.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`

**Consumes**
- `CancelOrderResultDto cancel(String orderId, String reason)`

**Produces**
- controller 继续输出原有 HTTP response
- domain policy 不再依赖 Spring 注解
- bean 装配落点明确到 configuration

- [ ] 写失败测试
  - 先让 controller / integration test 面向新的 use case 返回类型
- [ ] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerIntegrationTest test`
  - Expected failure: controller 返回类型与 use case 签名不一致，或 `OrderCancellationPolicy` wiring 缺失
- [ ] 实现最小 GREEN 改动
  - 去掉 `OrderCancellationPolicy` 的 `@Component`
  - 新增 `OrderDomainConfiguration` 提供 bean
  - 在 controller 中做最小显式映射，保持现有 HTTP response 不变
- [ ] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerIntegrationTest test`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

### Task 3: 迁移 persistence adapter 依赖方向，并补 repository adapter 本地 DB 回归保护

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/JpaOrderRepository.java`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/infrastructure/persistence/JpaOrderRepositoryIntegrationTest.java`

**Consumes**
- `com.example.orders.domain.repository.OrderRepository`

**Produces**
- `JpaOrderRepository` 实现 domain repository port
- repository adapter 的本地 DB 回归保护

- [ ] 写失败测试
  - 新增 `JpaOrderRepositoryIntegrationTest`，覆盖 `findById` / `save` 的最小持久化路径
- [ ] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=JpaOrderRepositoryIntegrationTest test`
  - Expected failure: 新测试未通过，或 adapter 尚未切到新的 domain port
- [ ] 实现最小 GREEN 改动
  - 让 `JpaOrderRepository` 实现新的 domain repository port
  - 维持现有手工 mapping，暂不引入 MapStruct
- [ ] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=JpaOrderRepositoryIntegrationTest test`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

### Task 4: 补齐 cancel-order 最小 error contract 与验证

**Files**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/ApiErrorResponse.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/ApiExceptionHandler.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/openapi/order-service.yaml`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`

**Consumes**
- 现有 cancel-order success path
- `IllegalArgumentException` / `IllegalStateException` / Bean Validation 失败

**Produces**
- `400` / `404` / `409` 的最小稳定错误响应
- OpenAPI 对应 response / schema

- [ ] 写失败测试
  - 在 integration test 中补 404 / 409 / 400 三条错误路径断言
- [ ] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerIntegrationTest test`
  - Expected failure: 当前异常路径未映射为稳定 HTTP 语义或响应模型不匹配
- [ ] 实现最小 GREEN 改动
  - 新增最小错误响应 DTO
  - 新增 `@ControllerAdvice`
  - 更新 OpenAPI error responses
- [ ] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerIntegrationTest test`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

### Task 5: 为当前纵切引入最小 MapStruct 示例

**Files**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/mapper/OrderCancellationApplicationMapper.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/mapper/OrderCancellationApiMapper.java`
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/mapper/OrderPersistenceMapper.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/pom.xml`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/application/OrderCancellationService.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/infrastructure/persistence/JpaOrderRepository.java`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/application/OrderCancellationServiceTest.java`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`
- Test: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/infrastructure/persistence/JpaOrderRepositoryIntegrationTest.java`

**Consumes**
- `CancelOrderResultDto`
- `CancelOrderResponse`
- `OrderRecord`
- `OrderEntity`

**Produces**
- 当前 cancel-order 纵切的最小 MapStruct 映射链

- [ ] 写失败测试
  - 保持当前三组测试为回归面，并以编译失败作为本轮 RED 信号
- [ ] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml test`
  - Expected failure: mapper 未生成或 wiring 不完整导致编译/测试失败
- [ ] 实现最小 GREEN 改动
  - 在 `pom.xml` 引入最小 MapStruct 依赖与 annotation processor
  - 用最小 mapper 替换当前纵切里的手工映射
- [ ] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml test`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review
