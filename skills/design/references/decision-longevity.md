# Decision longevity

在写 design decision 前读取。目标不是预测三个月后的所有变化，而是避免当时无法解释、运行或退出的决定。

## Workflow

1. 写清当前 forces：用户价值、现有边界、约束、风险与证据。
2. 比较至少一个现实替代方案，包括“不做/延后/更简单实现”。
3. 标记 reversibility：`reversible`、`costly-to-reverse`、`effectively-irreversible`。
4. 对高代价决定完成 longevity lenses；存在业务取舍时返回 `NEEDS_DECISION`。
5. 记录 revisit trigger；未来用 superseding decision 更新，不改写原决定。

## Decision lenses

- **Fit**：是否顺着现有模块、数据 ownership 与团队能力，而不是引入第二套真相。
- **Evolution**：新增 consumer、流量、数据量或规则后，边界是否仍可扩展。
- **Operations**：能否观察、告警、诊断、恢复；谁在非工作时间拥有它。
- **Change safety**：migration、兼容窗口、rollback 与 partial failure 是否可执行。
- **Security/data**：trust boundary、最小权限、敏感数据生命周期与审计是否明确。
- **Economics**：实现复杂度、运行成本、认知负担是否匹配当前价值。
- **Exit**：替换、停用或 supersede 的路径是什么，什么指标触发重评。

## Failure modes

- 只写选中方案，不写 serious alternative 与 consequence。
- 用“可扩展”“高性能”“安全”代替量化约束或验证路径。
- 为假想未来增加 permanent abstraction，却没有当前 consumer。
- 把不可逆数据/API 决定留给 Implement 临场选择。
- 有 rollback 标题但没有触发条件、owner 或恢复步骤。

## Sources

- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/definitions.html)
- [Google Research: Improving Design Reviews at Google](https://research.google/pubs/improving-design-reviews-at-google/)
- [Martin Fowler: Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
