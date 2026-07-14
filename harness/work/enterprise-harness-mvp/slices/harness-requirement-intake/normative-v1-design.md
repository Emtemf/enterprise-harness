# Harness Requirement Intake v1 规范性设计

## 文档地位

本文件是 Harness Requirement Intake 第一版的**规范性设计**。

- `MUST` / “必须”：v1 hard requirement
- `SHOULD` / “应该”：默认要求，偏离时必须记录原因
- `MAY` / “可以”：可选能力

完整愿景、上游映射、数据库长期治理、协作治理、双轴评审框架与 v2/v3 路线图见：

- `design.md`（Enterprise Harness Target Architecture）

如果两份文档冲突，v1 实现与验收以本文件为准。

## v1 目标

第一版只验证一件事：

> 一个企业 Java 服务需求能否被稳定地分流、获得最小足够证据、完成必要的人类决策，并按照风险进入轻量路径或完整设计路径。

v1 不追求一次性实现完整平台治理。

## v1 非目标

以下内容明确不进入 v1 hard requirements：

- 模型辅助 Router 或独立分类器
- 强制双轴 metadata
- mutating subagent 并行实现
- worktree 自动化
- 企业级跨仓数据库 catalog
- 每个业务域固定三文件目录树
- standalone checklist 文件爆炸
- lesson promotion 自动化
- async review 自动化
- Checkstyle / PMD 全套统一治理
- installer、dashboard、跨服务 orchestrator

这些能力保留在 Target Architecture 路线图中，不得阻塞 v1 落地。

## v1 核心原则

1. 先分流，再扩展上下文。
2. Router 的初判不是最终事实。
3. 只有证据确认后才能给 final tier。
4. 高风险信号可以自动升级，不能无证据降级。
5. L0/L1 不得被迫走完整设计流程。
6. L2/L3 未通过 design gate，不得进入 implementation plan。
7. v1 实现阶段采用 single-writer。
8. Hooks 只提供快速反馈；显式 full verification 才是本地 hard gate。
9. 一个规范性事实只有一个 source of truth。
10. 数据库文档不得复制成第二套 schema。

## 规范性主流程

```text
用户需求
  ↓
Provisional Triage（初步分诊）
  ↓
Minimum Discovery（最小探索）
  ↓
Evidence-confirmed Route（证据确认路由）
  ├─ L0 → 定向验证 → 完成
  ├─ L1 → 轻量 spec → 定向 TDD/验证 → result → 完成
  ├─ L2 → design → self-review → approval → plan → TDD → verification → result
  └─ L3 → L2 全流程 + 明确人工 review verdict
  ↓
必要时进行长期知识提升
```

## 1. Provisional Triage

初步分诊只根据需求文本识别硬信号和未知项，不得假装已经理解代码影响面。

### 必须输出

```yaml
request_shape: new | modify | mixed | unknown
candidate_scope: method | module | domain | service | platform | unknown
candidate_tier: L0 | L1 | L2 | L3 | unknown

hard_signals:
  - api_change
  - schema_change
  - architecture_change
  - platform_rule_change
  - cross_service_change

unknowns: []
needs_minimum_discovery: true
```

### 规则

- `mixed` 用于同时包含新增与修改的需求。
- 未经探索，API/data/architecture 影响必须允许为 `unknown`。
- 初步分诊不得决定 worktree、并行写入或 mutating subagent。
- 任何 API、schema、architecture、platform rule 或 cross-service 硬信号，都不得初判为 L0/L1。

## 2. Context Triage 与 Minimum Discovery

Minimum Discovery 的目标是取得**最少但足够**的证据，不是遍历所有上下文。

### 分诊顺序

1. 主诉：到底要改变什么
2. 归属：哪个 module / domain / service 拥有它
3. 风险：是否影响 API / data / architecture / rule
4. 最小证据：定位少量关键代码、contract、migration 或规则
5. 扩展：只有证据不足时才扩大范围

### Java 仓库探索

- codegraph index 可用时，应 codegraph-first。
- codegraph 不可用时，必须记录 fallback 方法。
- L3 在 codegraph 不可用且影响面无法可靠确认时，应视为 blocker。

### 模块归属

修改需求必须先找 owning module。

新增需求也必须先确认：

- 是否已有模块可以承载
- 是否确实需要新 module / domain
- 是否只是新增一个 feature/slice

当前仓库里的 `interface/review`、`interface/template` 等模块拓扑只是 service-local 证据；未经跨服务验证，不得直接提升为企业全局标准。

## 3. Evidence-confirmed Route

最小探索完成后，再形成 final route。

### 必须输出

```yaml
request_shape: new | modify | mixed
final_tier: L0 | L1 | L2 | L3
owning_scope: "..."

impact:
  api: yes | no | unknown
  data: yes | no | unknown
  architecture: yes | no | unknown
  rule: yes | no | unknown

routing_reason: []
evidence_links: []
blockers: []
decisions_required: []

human_override: false
override_reason: null
downgrade_reason: null
```

### 路由规则

- 文案、typo、小型纯文档变化，且无规范语义变化：L0
- 单模块局部代码变化，无 API/data/architecture/rule 影响：L1
- API、OpenAPI、schema、migration、persistence 或新业务能力：至少 L2
- 跨域、跨服务、架构边界、平台规则变化：L3
- `unknown` 不能被解释为 `no`。
- final route 后出现新证据时，tier 默认只能升级。
- 从硬信号路径降级必须记录 `downgrade_reason`。
- L3 降级必须经过 Decision Capture Gate。

## 4. Decision Capture Gate

Harness 的正式概念是 **Decision Capture Gate**，不绑定某个具体工具。

### 适用场景

会改变后续路径的决策必须由用户或授权 reviewer 明确确认，例如：

- breaking compatibility 策略
- 新 module / domain 创建
- 数据模型方案
- L3 降级
- waiver
- scope 拆分

### 可接受证据

- `AskUserQuestion` 的结构化选择
- 普通对话中的明确选择
- 异步 review verdict
- 已批准的决策文档

`AskUserQuestion` 是交互式适配器之一，不是 Harness 的永久领域概念。

## 5. Tier 路径与最小 artifact

| Tier | 必需 artifact | 必需 gate | 实现/验证方式 |
|---|---|---|---|
| L0 | 默认不创建 harness artifact | route 证据充分 | 定向检查 |
| L1 | 一个 `spec.md` | final route | 定向 RED → GREEN → REFACTOR + result section |
| L2 | `design.md`、`plan.md`、`result.md` | design self-review + approval | 完整 TDD + verification |
| L3 | 与 L2 相同 | 人工 design review verdict + 必要决策 | 完整 TDD + 强化 verification |

### Artifact 简化规则

- L1 的 intake、计划和结果可以合并进一个 `spec.md`。
- L2/L3 的 intake 作为 `design.md` 第一节，不要求额外 `intake.md`。
- exploration 默认内联；只有证据较大或可跨 slice 复用时才拆到 `harness/explorations/`。
- v1 不要求每个需求再复制一份 `harness/changes/.../proposal.md`。
- standalone readiness/self-review checklist 文件不进入 v1；检查项嵌入对应 artifact。

## 6. Harness Scoping

v1 不设置独立的 Scoping artifact。

Scoping 是 Evidence-confirmed Route 与 Design 之间的一个短决策：

- 当前需求是否适合一个 slice
- 是否要拆分
- 每个 slice 的边界是什么

输出直接写入 L2/L3 `design.md`，或 L1 `spec.md`。

## 7. Design Gate

L2/L3 design 必须包含：

- 需求与 owning module/domain
- 选定方案与放弃方案
- API 影响
- data 影响
- architecture 影响
- error handling
- testing strategy
- compatibility / rollout / rollback
- 未决问题与明确假设

### API / Data 双轨检查

涉及后端能力时，必须分别回答：

#### API 线

- 新增还是修改接口
- 归属哪个 interface module
- OpenAPI/request/response/error contract 变化
- compatibility 策略

#### Data 线

- 新增还是修改表结构
- owning domain/module
- 是否可复用现有表/关联表/扩展表
- migration/backfill/rollback/audit 影响

最终必须确认 API 归属、module 归属和 data 归属一致。

### Design Self-Review

Design self-review 必须给证据，不能只有 checkbox。

至少检查：

- requirement alignment
- scope/slice size
- architecture boundaries
- API/data consistency
- documentation evidence
- testing strategy
- ambiguity/assumptions
- failure/rollback

默认最多两轮；两轮后仍有实质不确定性，应升级到 Decision Capture Gate 或 reviewer，而不是无限修文档。

## 8. Documentation Lookup

文档查询采用条件必查。

必须查文档的典型场景：

- framework / SDK / library 行为
- OpenAPI/schema 工具链
- 企业内部平台
- 版本相关行为
- security/auth/rate limit/compliance
- migration/ORM 行为

### 权威来源按事实类型区分

- 组织政策、合规和企业允许范围：企业内部规则/文档为准
- 外部 API/SDK 实际行为：当前官方 vendor 文档和官方 SDK 为准
- 实际安装版本：lockfile、build file 和本地依赖为准
- 仓库当前实现：代码、测试和配置为准

来源冲突且无法判断事实类型时，必须成为 blocker，不能笼统地让内部文档覆盖外部技术事实。

## 9. Database v1

### 事实来源优先级

1. versioned migration / DDL
2. schema introspection 或生成证据
3. JPA entity 仅作为 discovery 输入
4. Harness database docs 只记录 owner、用途、风险与权威链接

### Table Discovery Gate

涉及新增/改表、索引、约束、审计、归档或迁移时，必须：

1. 确认 business domain 与 owning module
2. 查找现有主表、扩展表、关联表、审计表
3. 判断复用/扩展还是新增
4. 识别上下游依赖
5. 记录 migration/backfill/rollback 影响

找不到明确归属时，必须阻塞 design 或拆 discovery slice。

### v1 catalog 范围

v1 MAY 建立一个 service-local catalog 示例，只记录：

- domain
- owner
- table purpose
- risk boundary
- authoritative migration/DDL link

不得复制完整列、索引和关系定义。企业跨仓全局 catalog 不属于 v1。

## 10. Instruction Layering 与 Source of Truth

### Root `CLAUDE.md`

只放：

- 一句话愿景
- 做什么 / 不做什么
- 验收与验证入口
- 核心工作流摘要
- rules/specs 指针

### `rules/`

唯一承载规范性 MUST/SHALL/gate 规则。

### `harness/specs/`

解释模型、理由、示例和稳定状态；引用 `rules/`，不得复制规范文本。

### `harness/work/`

活动 slice 与完成证据。

### `harness/explorations/`

时间点证据，不是永久真理。

### `harness/changes/`

v1 中只用于被正式接受、需要保留变更轨迹的重大变化，不是每个需求必经层。

## 11. Artifact Lifecycle

```text
exploration evidence
        ↓
active work slice
        ↓
completed result（冻结）
        ├─ 如需正式变更轨迹 → changes
        └─ 如形成当前稳定真相 → specs
```

- `work/` 完成后保留历史引用，但必须标记 completed，不再被视为活动工作。
- 长期规则更新进入 `rules/`。
- 稳定状态描述进入 `specs/`。
- 同一规范正文不得复制到多个层。

## 12. Execution Strategy v1

- v1 采用 single-writer。
- 只有主执行者或一个 mutating worker 可以修改工作区。
- reviewer/explorer 只能使用只读能力。
- reviewer 结论返回主执行者，不直接编辑文件。
- 当前 workspace 不是 git repository，worktree 不进入 v1。
- worktree 与 mutating subagent 进入 v2 前，必须先完成 Git 化、生命周期、integration owner 与独立验证设计。

### Reviewer 的真实状态

当前 `agents/*.md` 是 reviewer guide，不是真正注册的 Claude Code subagent。

v1 plan 必须明确选择：

- 继续作为 guide，并由主执行者显式读取；或
- 转为正式项目 subagent，配置发现位置、frontmatter 和只读工具 allowlist

不能把“文件存在”当成“review 已自动运行”。

## 13. TDD 与 Architecture Gate

### TDD

L1-L3 代码变化必须体现：

```text
RED → GREEN → REFACTOR → VERIFY
```

### ArchUnit 引入顺序

当前 reference service 还不符合拟议的目标依赖边界，因此必须按顺序执行：

1. 明确目标依赖方向
2. 修正 reference service
3. 增加最小 ArchUnit canary
4. Maven 与 ArchUnit 全绿后再提升为 hard gate

禁止先加会把黄金样例立即判红的 hard gate。

对于遗留服务，后续应采用：

- 新代码零新增违规
- 旧违规有 baseline
- baseline 只能减少，不能增加

## 14. Hooks 与 Verification

### Fast feedback

PostToolUse hook 应根据 changed file 只运行相关 checker。

要求：

- 不依赖当前 shell cwd
- 区分 pass / skip / not-applicable / fail
- 目标 p95 小于 2 秒
- 不对无关文件运行 OpenAPI/controller 检查

### Hard verification

v1 必须提供一个显式 full verification 命令，至少运行：

- structure checks
- reference-service Maven tests
- 相关 OpenAPI/controller checks
- 已引入后的 ArchUnit test

在 Git/CI 接入前，只能称为 local hard gate，不能声称企业级强制执行。

## 15. Golden Path

v1 必须有一个真实但规模可控的 Java requirement 端到端样例，覆盖：

```text
provisional triage
→ minimum discovery
→ final route
→ decision capture（如需要）
→ design/spec
→ plan
→ TDD
→ verification
→ result
```

团队应能在不阅读 Target Architecture 全文的情况下，依据 golden path 完成一次需求。

## 16. Pilot 与升级条件

v1 先运行 4 周或前 20 个代表性需求。

至少记录：

- provisional tier 与 final tier
- route 升级/降级/人工覆盖次数
- false negative 抽样复审
- 每个 tier 的 artifact 数量
- L1 intake 额外耗时
- hook p95 与误报数
- 因文档过期产生的返工

只有具备真实样本和清晰误分流定义后，才能讨论 Router v2。

## 17. v1 Go / No-Go 标准

满足以下条件才可称为 v1 可落地：

- 至少 10 个代表性需求完成两阶段 routing
- 未发现未升级的高风险 false negative
- L1 intake 中位额外耗时不超过 10 分钟
- 每个 L1 最多维护一个 artifact
- fast hook p95 不超过 2 秒，且无无关文件误报
- reference-service Maven 与 ArchUnit tests 同时通过
- reviewer subagent 若存在，已验证不能修改工作区
- 数据库规范都能指出权威 migration/DDL 来源
- 团队可仅依据 root entry、v1 design 和 golden path 完成流程

## v1 设计自检

### 范围

通过：v1 与 Target Architecture 已分离，v2/v3 内容不会阻塞第一版。

### 路由

通过：采用 provisional → discovery → final route；支持 `unknown`、`mixed`、证据与降级理由。

### 工具解耦

通过：正式概念为 Decision Capture Gate，`AskUserQuestion` 只是适配器。

### Source of Truth

通过：`rules/` 承载规范规则，`specs/` 承载解释与稳定状态，数据库结构事实来源独立定义。

### 执行安全

通过：v1 single-writer；worktree 和 mutating subagent 延期到 v2。

### 循环收敛

通过：design self-review 默认最多两轮，之后升级、阻塞或拆分。

### 未决实现细节

以下属于 implementation plan 决定，不在 design 阶段猜测：

- v1 intake 入口的具体 skill 名称和文件位置
- reviewer guide 是否转换为正式 subagent
- full verification 命令的具体脚本结构
- ArchUnit 具体依赖版本和规则类名
- golden path 使用哪个真实需求
