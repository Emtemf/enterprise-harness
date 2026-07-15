# Requirement Intake 规范

## 目标

定义企业 Java 后端需求在进入 design / plan / implementation 之前的最小分流、探索、澄清与证据要求。

## 主流程

```text
用户需求
→ Clarify
→ Provisional Triage
→ Minimum Discovery
→ Evidence-confirmed Route
→ 按 L0/L1/L2/L3 进入对应下游路径
```

## Provisional Triage

在没有深入探索前，至少给出：

- request shape：`new` / `modify` / `mixed` / `unknown`
- candidate scope：`method` / `module` / `domain` / `service` / `platform` / `unknown`
- candidate tier：`L0` / `L1` / `L2` / `L3` / `unknown`
- hard signals
- unknowns

规则：

- `unknown` 不能被解释为 `no`
- 有 API / schema / architecture / cross-service 硬信号时，不得初判为 L0/L1

## Minimum Discovery

最小探索的目标是拿到最少但足够的证据，而不是遍历全部上下文。

### 代码探索
- 默认 codegraph-first
- codegraph 不可用时允许 grep / Read fallback，但必须记录原因、范围与可信度
- L3 在 codegraph 不可用且影响面无法可靠确认时，默认 blocker

### 文档探索
- 涉及外部库、框架、SDK、版本行为时默认 Context7-first
- Context7 不足时回退到 vendor docs / 官方源码

## 决策澄清

clarify-first staged workflow 下，澄清不是“必要时才做”，而是进入 route 前的强制阶段：

- 默认一次一个高影响问题
- 每轮应显式针对 weakest dimension 发问
- 先探索，再问用户
- 用户未确认执行范围前，不得进入 route/design/plan/implementation
- 低影响局部选择采用合理默认并记录
- 无法确定时 block，而不是猜测继续

## Final Route

最少要记录：

- final tier
- owning module / domain / service
- impact：api / data / architecture / rule
- routing reason
- evidence links
- blockers
- decisions required

## Tier 要求

### L0
- 定向验证
- 默认不建完整 change bundle

### L1
- `requirements.md` + 轻量 spec
- 定向 RED → GREEN → REFACTOR 证据

### L2
- `requirements.md`
- durable design
- design approval 后进入 plan

### L3
- `requirements.md`
- 完整设计路径
- 明确 reviewer verdict

## 资产落点

- 长期真相：`harness/specs/`
- 活动 change：`harness/changes/<change-id>/`
- 探索证据：`harness/explorations/` 或 `harness/changes/<change-id>/evidence/`
- 短地图：根 `CLAUDE.md`
