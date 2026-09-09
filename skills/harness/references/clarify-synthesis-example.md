# Clarify durable synthesis 小样例

Load when: `clarify-decisions.md` 首次把 clean ResearchPackets 综合为 durable topology、Evidence ledger、评分和 Frontier。
Return to controller: 格式校准完成后返回 `clarify-decisions.md`；本例不拥有 runtime action，也不单独推进 route。

只用于首次把 clean ResearchPackets 综合进 `requirements.md`。事实内容必须来自当前
`clarify synthesis-sources`，本例只示范格式。

假设 source 输出恰好包含 raw claim `为现有订单服务增加取消能力`、code claim
`OrderService currently has no cancel method.`，合法投影是：

```markdown
| Component | Outcome / boundary | Status | Depends on | Confirmation source |
|---|---|---|---|---|
| order-cancellation | 用户可独立观察取消成功或失败的结果边界 | active | none | E-RAW-1 |

| Evidence ID | Kind | Locator | Claim | Supports |
|---|---|---|---|---|
| E-RAW-1 | raw-request | original-request | 为现有订单服务增加取消能力 | order-cancellation:Goal.outcome |
| E-FACT-1 | research-packet | fact:code | OrderService currently has no cancel method. | order-cancellation:Context.current-state |

| Component | Dimension | 上轮分数 | 本轮分数 | Predicate coverage | Evidence refs | Gap / unresolved decision | Gap type | Owner / status |
|---|---|---:|---:|---|---|---|---|---|
| order-cancellation | Goal | — | 2 | outcome | E-RAW-1 | consumer 未定义 | Decision | user / open |
| order-cancellation | Scope | — | 0 | | | included/excluded 未定义 | Decision | user / open |
| order-cancellation | Constraints | — | 0 | | | technical/risk 未定义 | Decision | user / open |
| order-cancellation | Acceptance | — | 0 | | | success/failure/observable 未定义 | Decision | user / open |
| order-cancellation | Context | — | 2 | current-state | E-FACT-1 | need 未定义 | Decision | user / open |

| Priority | Component | Unresolved dimension | Current score | Evidence / known fact | Risk | Next action |
|---:|---|---|---:|---|---|---|
| 1 | order-cancellation | Acceptance | 0 | gap source | high | ask |
```

分数固定为 `floor(covered/total*4)`；全覆盖为 4，有 `.confirmed` 才是 5。未决/否定知识（如“没有说明
退款失败策略”）只能支持 `order-cancellation:Acceptance.gap`，不能写成 `.failure` 并抬分；gap evidence
也不能列入 score row 的 Evidence refs。禁止缩写 claim、`✓/✗`、无关 refs、同一来源重复支持。
