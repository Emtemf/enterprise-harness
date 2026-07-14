# API 契约规则

## 契约所有权

每个对外 API 服务都必须拥有自己的 OpenAPI / YAML 契约文件。

当前本地参考位置：

- `reference-service/openapi/order-service.yaml`

## 必须保持一致的内容

契约与实现至少应在以下方面保持一致：

- path
- HTTP method
- request DTO / payload intent
- response DTO / payload intent
- error contract summary

## 设计要求

当 API 变化发生时，design 必须明确说明：

- 新增还是修改接口
- 兼容性策略
- request / response / error 变化
- 是否影响现有调用方

## 验证要求

本地与后续 CI 验证应逐步升级到：

1. YAML 文件存在
2. YAML 基本结构合法
3. path / method 与 controller 对齐
4. request / response / error 契约可解析
5. 运行时 API 行为与 owned contract 对齐

## 当前 MVP 过渡说明

现有 hook 仍以轻量 marker 检查为主，但这不是最终门禁能力。后续必须替换为真实 OpenAPI parser / validator。

## 禁止事项

- 不得只有 200 response 而忽略实际 error path
- 不得让 controller 与 YAML 漂移后仍宣称契约一致
- 不得把“文件缺失”当成可成功跳过的正常状态
