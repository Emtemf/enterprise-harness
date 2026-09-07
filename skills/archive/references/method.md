# Archive 方法

1. Archive 是封存步骤，不是新的实现或验证步骤；只消费 fresh Verify CompletionProof 和既有 durable artifacts。
2. 按 lineage 顺序核对目标、设计、测试、计划、实现和验证证据，并保留 Clarify 决策、技术债及项目契约处置。
3. manifest/attestation 只能由 runtime facade 写入；StageResult 只能由 finalizer 持久化。
4. 独立 reviewer 检查 StageResult 与全部 lineage，不读取 executor 对话，也不复用 executor identity。
5. Archive CompletionProof 由 runtime 生成；物理移动只能由 `lifecycle archive-finalize` 完成。
6. 失败时保留 active change 和已生成证据；未完成工作由 Main 选择修复或带原因 abandon。
