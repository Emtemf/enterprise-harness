# Java 与 API

- 默认 Java 21、Spring Boot、Maven Wrapper。
- 尊重目标项目现有分层；无既有约定时使用 interfaces/application/domain/infrastructure。
- domain 不依赖 Spring、数据库或 HTTP。
- application 编排 use case 和事务边界。
- interfaces 处理协议与 DTO，infrastructure 实现端口。
- 公开 API 先设计 request、response、errors、幂等、鉴权和兼容性。
- 数据变更设计 schema、索引、迁移、回滚和并发语义。
- OpenAPI 无法解析时返回 `unsupported`，不得 pass。
- 不在 runtime 中硬编码 reference-service controller 或路径。
- 所有生产与测试写入遵守 active change、design、plan 和 RED gate。
