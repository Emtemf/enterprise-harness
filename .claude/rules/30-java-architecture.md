# Java 架构规则

## 目标

本项目的 Java 后端默认遵循清晰、可验证的四层结构，并以编译期依赖方向作为硬约束。

## 概念层

- interface layer
- application layer
- domain layer
- infrastructure layer

物理包名可继续使用：

- `interfaces`
- `application`
- `domain`
- `infrastructure`

## 编译依赖方向

允许：

```text
interfaces -> application -> domain
infrastructure -> domain
bootstrap/composition root -> interfaces + application + infrastructure
```

禁止：

```text
domain -> application / interfaces / infrastructure / Spring / JPA
application -> interfaces / infrastructure
interfaces -> infrastructure / domain internals
```

## 对象边界

### Interface
只允许 HTTP / transport 对象：

- `*Req`
- `*Rsp`

### Application
只允许 use-case 输入输出 DTO：

- `*Dto`
- 推荐区分 `*CommandDto` / `*ResultDto`

### Domain
只允许：

- aggregate
- entity
- value object
- policy
- repository port

不得使用 `Req` / `Rsp` / `Dto` / `Entity` 这类跨层技术后缀。

### Infrastructure
只允许技术表示对象：

- `*Entity`
- repository adapter
- external client adapter

## Repository 规则

- repository port 归 `domain`（或后续正式批准的 inward port 层）
- infrastructure 负责实现 port
- application 只能依赖 port，不能依赖 infrastructure 实现包
- 使用 MyBatis / JPA / SQL 时，SQL 访问与 persistence mapper 只允许停留在 infrastructure；不得在 application / domain 中直接写 SQL 或拼接查询细节

## 领域模型规则

- 领域模型默认优先采用充血模型，而不是把核心业务规则全部下沉到 service/convert 层
- domain 应承载真正的业务不变量、状态流转与决策方法
- 若暂时无法采用充血模型，必须在 design 或 waiver 中说明为什么仍保持贫血模型

## MapStruct 规则

跨层对象转换默认使用 MapStruct：

1. interface mapper：Req/Rsp ↔ application DTO
2. application mapper：application DTO ↔ domain
3. infrastructure mapper：domain ↔ Entity

禁止长期保留手工跨层复制逻辑，除非有明确例外并记录原因。

## 设计与评审要求

- design 必须明确列出受影响层
- design 必须解释 repository port 所在层与 mapper 责任
- review 必须识别是否出现跨层泄漏
- 后续 full verification 应接入 ArchUnit 等机械检查
