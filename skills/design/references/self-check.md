# Design 自检

提交 StageResult 前逐项检查：

1. `prepare-input.mjs HANDOFF_INPUT=<path>` 返回的 change/run identity 和全部 input digest 仍与 handoff 一致。
2. 每个 `R*` 的 `D* / E* / V* / RB*` 均存在且语义匹配，没有仅靠关键词出现的伪 trace。
3. 组件职责、依赖方向、事务边界、成功路径及失败/超时/重试路径完整。
4. API/Data impact 分支已按 classification 填写；不适用项包含可审计理由。
5. 安全、并发、一致性、observability、兼容、技术债处置及测试场景没有被静默遗漏。
6. 没有提前冻结无事实依据的类、方法、文件或工具；没有未替换的 TBD/TODO/按需。
7. 缺少真实业务选择时返回一个 `NEEDS_DECISION`，不运行 finalizer 伪造 pass。
8. 下游坑点命中项先修正；最终制品明确写 `verdict: pass`、`unresolved decisions: none`、`downstream findings: none`。仍有 finding 时不得 finalizer。
9. 三个 assertions 全部通过；self-check 不使用“approved”措辞。

独立 reviewer 必须使用不同 run，消费 design artifact、StageResult、input digests 与 classification-selected rubrics，而不是 Design worker 的对话。
