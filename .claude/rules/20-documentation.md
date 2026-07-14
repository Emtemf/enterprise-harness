# 文档与外部资料规则

## 总原则

涉及外部库、框架、SDK、OpenAPI 生态、构建插件或版本敏感行为时，默认 **Context7-first**。

Context7-first 的含义是：

1. 先确认本项目实际依赖与版本
2. 先尝试 Context7
3. Context7 不足时，再查官方 vendor docs
4. 再不够，才查官方源码 / Javadoc / 更广泛网页资料

## Context7 推荐流程

### 第一步：确认依赖事实
必须先从项目文件确认实际依赖：

- `pom.xml`
- Gradle 配置
- lockfile / 版本声明

### 第二步：解析文档目标
优先使用两步模式：

1. `resolve-library-id`
2. `query-docs`

当前项目默认使用 Context7 CLI 包装脚本作为可用路径：

1. `bash harness/bin/context7-library.sh <name> <query>`
2. `bash harness/bin/context7-docs.sh <libraryId> <query>`

若未来项目再接入 Context7 MCP，可把 MCP 作为优先路径，但在当前阶段不得把“待审批的 MCP”误当成可用能力。

### 第三步：记录文档证据
文档证据至少包括：

- library name
- resolved library id
- version
- query
- 结论摘要
- 若 fallback，则写明原因

## 何时必须查文档
以下情况默认必须查文档：

- 引入新依赖
- 调整已有依赖的使用方式
- 处理 Spring Boot / MapStruct / ArchUnit / JaCoCo / RestAssured / OpenAPI parser 等框架行为
- 处理版本差异、兼容性或配置项
- 处理官方 API / SDK 契约

## 何时可以不查文档
仅当同时满足以下条件时可跳过：

- 纯业务规则变更
- 不改变外部库使用方式
- 本地代码与当前规则已足够说明行为
- 在 artifact 中明确写出跳过原因

## 权威性层级

在外部资料冲突时，优先级如下：

1. 当前项目实际代码与依赖版本
2. 官方 vendor docs / 官方 SDK 文档
3. 官方源码 / Javadoc
4. Context7 返回结果
5. 更广泛网页资料

Context7 是文档检索适配器，不是最终权威来源。

## 禁止事项

- 不得只凭模型记忆断定版本行为
- 不得把 Context7 返回内容直接当成永远正确的事实
- 不得在依赖版本未确认时写版本敏感实现
- 不得在文档缺失时假装已验证过官方行为
