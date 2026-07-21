# Design

## Requirement Alignment

本 change 对应 issue #12，目标是在不扩大 `reference-service` 业务范围的前提下，引入两类机械质量门禁：

1. ArchUnit 架构边界检查
2. JaCoCo coverage measurement / check path

并明确它们如何融入当前本地验证与后续 CI。

## Current-State Evidence

当前仓库状态：

- `reference-service/pom.xml` 只有 Spring Boot / MapStruct / 测试依赖，没有 ArchUnit / JaCoCo
- 当前“架构测试”只是 `OrderCancellationPolicyArchitectureTest` 中对 `@Component` 的反射断言，不是 ArchUnit
- 当前 controller integration 使用 MockMvc，不属于真实 HTTP E2E
- 当前 repo-level `hooks/full-verify.sh` 仍偏 contract/runtime 层，不应被误表述成 Java 质量 profile

## Selected Approach

### 1. ArchUnit 第一版只验证最关键依赖方向
第一版不追求“一次性覆盖全部层规则”，而是冻结最关键的边界：

- `domain` 不得依赖 Spring / Web / JPA / `interfaces` / `application` / `infrastructure`
- `application` 不得依赖 `interfaces` / `infrastructure`
- `interfaces` 只允许依赖 `application` 与 transport/validation 框架，不直接依赖 `domain` internals / `infrastructure`
- `infrastructure` 允许依赖 `domain`，但不反向污染 `application`

### 2. repository port 与 mapper 责任显式冻结
为避免后续 ArchUnit scope 猜测，当前 reference-service 的边界明确为：

- `domain.repository.OrderRepository`：domain inward port
- `infrastructure.persistence.JpaOrderRepository`：infrastructure adapter，负责实现 domain port
- `interfaces.api.mapper.OrderCancellationApiMapper`：仅负责 `Req/Rsp ↔ application DTO`
- `application.mapper.OrderCancellationApplicationMapper`：仅负责 `application DTO ↔ domain`
- `infrastructure.persistence.mapper.OrderPersistenceMapper`：仅负责 `domain ↔ Entity`
- MapStruct 生成的 `*MapperImpl` 视为 generated artifacts；第一版 ArchUnit 不直接对其生成类做额外规则约束，避免 generated code 噪声误伤边界语义

### 3. JaCoCo 第一版 scope 现在就定稿
当前 issue 的核心之一就是 coverage gate 语义，因此第一版直接冻结：

- 门禁命令：`mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
- 质量指标：`LINE COVEREDRATIO >= 85%`
- 检查元素：**BUNDLE**
- 第一版全局排除：
  - `com.example.orders.ReferenceServiceApplication`
  - `com.example.orders.config.*`
  - `**/*MapperImpl`

选择理由：
- 保持与仓库规则中“85% line coverage”目标一致
- 不把 bootstrap/config/generated mapper 噪声误当成 sample 核心质量
- 避免在 plan/编码阶段临时再决定 bundle/package/include/exclude

### 4. 当前只文档化 CI 接入位置，不在本轮强行改 CI
本轮先把本地硬门禁做实：

```bash
mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify
```

同时在文档中说明：
- 当前 repo-level `full-verify.sh` 仍不是 Java quality gate
- 后续 CI 应复用同一个 Maven `verify` 命令，而不是重新定义另一套绿灯含义

## Rejected Approaches

### Rejected A：一次性把真实 HTTP E2E 与 OpenAPI parser 一并塞进 #12
原因：
- issue #12 明确是 #9 的窄子问题
- 真正的随机端口 HTTP E2E 与 OpenAPI semantic validation 会扩大实现面
- 会让本轮无法快速形成可验证的最小质量门禁

### Rejected B：只加依赖和说明，不接 Maven `verify`
原因：
- 那样不能形成机械门禁
- 无法满足 issue #12 的“runnable architecture checks”与“coverage gate path”目标

## Affected Files

### 必改
- `reference-service/pom.xml`
- `reference-service/src/test/java/com/example/orders/domain/OrderCancellationPolicyArchitectureTest.java`

### 可能新增/修改
- 视 JaCoCo 报告结果，补少量现有逻辑测试
- `README.md`
- `CONTRIBUTING.md`
- `harness/changes/java-golden-quality-gates/validation.md`

## Testing Strategy

### Task 1：ArchUnit
- RED：先只把 `OrderCancellationPolicyArchitectureTest.java` 改写为 ArchUnit JUnit 5 风格，并在 **尚未** 添加 ArchUnit 依赖前运行测试，观察明确的缺依赖 / 无法解析符号失败
- GREEN：再在 `pom.xml` 中接入 ArchUnit 依赖，并让最小关键边界规则通过
- VERIFY：`mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test`

### Task 2：JaCoCo
- RED：先把 JaCoCo `prepare-agent/report/check` 接到 `verify`，并临时把 line coverage threshold 设为 **100%**。当前样板已有明确未覆盖面：`OrderCancellationServiceTest` 只有 happy path，`OrderCancellationPolicyArchitectureTest` 只做单条架构断言，因此 bundle 级 100% line coverage 必然失败，可作为确定性 `jacoco:check` RED。
- GREEN：再把 threshold 收敛到最终冻结的 `BUNDLE + LINE + 85%`，同时保留 agreed excludes，并按报告补齐必要测试或范围说明
- VERIFY：`mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`

### Task 3：文档与验证说明
- 该 task 属于文档/validation 对齐 task，验证重点是明确断言而不是关键词存在性
- 必须在 Task 1 / Task 2 的真实命令结果存在后，再回写 README / CONTRIBUTING / validation.md
- acceptance 断言至少应覆盖：
  - 当前本地 Java quality gate 命令就是 `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
  - 当前 repo-level `full-verify.sh` 不是 Java quality gate
  - 后续 CI 应复用同一个 Maven `verify` 命令

## Risks

- ArchUnit rule 如果过宽，容易把 `config` / bootstrap 噪声误当成核心失败
- JaCoCo 85% 若不先冻结排除范围，会在 plan/编码阶段不断回涨 scope
- 若文档不明确，容易再次把 repo contract verify 误解成 Java quality pass

## Rollout / Rollback

- rollout：先以最小 rule / 最小 coverage gate 落地，再看是否需要扩大约束范围
- rollback：若 rule 过宽导致样板失真，可先收窄 rule scope，而不是直接撤销 ArchUnit / JaCoCo 本身

## Approval Target

该 design 应在以下前提下可被视为 ready-for-plan：

- 明确只承诺 ArchUnit + JaCoCo + 文档/验证对齐
- 不隐式承诺真实 HTTP E2E / OpenAPI parser 已在本 issue 完成
- JaCoCo 85% 的 scope 与排除原则已明确冻结
- repository port 与三类 mapper 的责任边界已明确冻结
