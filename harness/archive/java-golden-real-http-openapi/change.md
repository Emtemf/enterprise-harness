# Change

## 原始需求

对应 issue #9：`[Java golden sample] Strengthen reference-service as a real backend sample`。

在 issue #12 已完成 ArchUnit + JaCoCo 的前提下，本轮继续把 `reference-service` 从“结构演示样例”推进为更接近 real backend sample 的 reference quality profile，当前聚焦：

- real HTTP backend E2E
- stronger OpenAPI semantic validation
- 更清晰的 MapStruct / quality-profile 说明

## 业务结果

让 `reference-service` 的质量声明不再只依赖：
- 结构分层
- MockMvc integration
- 轻量 YAML marker 校验

而是补上：
- 随机端口真实 HTTP 请求
- 持久化最终状态断言
- live `/v3/api-docs` 与 owned YAML 的关键语义对齐证据
- 更准确的 real backend sample / MapStruct / quality-profile 文档

## 非目标

- 不扩展新的业务纵切
- 不把 `reference-service` 扩成产品级服务
- 不把 runtime / installer / release productization 混入当前 change
- 不在本轮额外引入无关静态分析工具（如 PMD / SpotBugs / Checkstyle）
- 不在本轮把 sample-scoped 语义验证泛化成 repo-wide runtime verifier 平台能力

## 归属服务 / 模块 / 业务域

- scope: `reference-service`
- owning module: `reference-service/` + repo docs / change validation assets
- business domain: Java golden sample / real backend evidence / OpenAPI semantic validation

## 初步路由

- request shape: modify
- candidate tier: L2
- hard signals: api_contract_change, verification_change, architecture_change
- reason: 涉及真实 HTTP 验证方式、OpenAPI 语义证据与参考样板质量声明，但不扩展 API 业务能力本身，也不引入跨仓平台规则改造

## 最小探索证据

- 当前 `OrderCancellationControllerIntegrationTest` 使用 `@AutoConfigureMockMvc`，不是随机端口真实 HTTP E2E
- 当前 `checks.mjs` 只做轻量 OpenAPI 结构 / marker 校验，但本 issue 现已决定不在本轮把它升级成 repo-wide 平台能力
- `reference-service/openapi/order-service.yaml` 已存在 owned contract，可作为 stronger semantic validation 的锚点
- issue #9 的 comment 已明确要求：真实 HTTP + 持久化断言 + stronger OpenAPI semantic validation + MapStruct/quality-profile guidance，但仍保持 sample 小而清晰

## 最终路由

- final tier: L2
- owning scope: `reference-service real-http/openapi quality profile`
- next focus: 先形成 durable design / tasks，再按 TDD 逐步引入 random-port E2E、service-scoped OpenAPI semantic assertions 和 docs/validation evidence

## 影响矩阵

- API: yes
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- 随机端口 E2E 继续采用新增独立测试类，而不是替换当前 MockMvc integration
- stronger OpenAPI semantic validation 改为 service-scoped assertion（owned YAML ↔ live docs），不再修改共享 runtime verifier
- 本轮若调整 controller / Req / Rsp / error DTO，仅允许做**文档语义对齐**，不允许引入对外可观察 API 契约变化

## 假设

- #12 已收口 ArchUnit / JaCoCo，因此 #9 可以专注 real HTTP 与 OpenAPI semantic evidence
- 现有 `reference-service` 体量足够支持随机端口 HTTP E2E，而不需要新增业务能力
- stronger OpenAPI semantic validation 当前只服务于 `reference-service` sample，不在本轮强行泛化成通用平台能力

## Waiver

暂无。

## Requirement Review

该需求属于 `reference-service` 的验证方式与 sample 质量声明增强，会直接改变 Java golden sample 的完成证据强度，但不增加新的业务范围；按 L2 路由合理。
