# Design rubric

Reviewer 只消费冻结的 design artifact、StageResult、input digests 与 classification，不读取作者对话。逐项给出 evidence-bound verdict：

1. 每个 requirement 是否有唯一且闭合的 `R* → D* → E* → V* → RB*`，引用语义而非仅字符串存在。
2. 组件职责、依赖方向、事务所有权以及成功、交互与失败路径是否清晰，错误/超时/重试对外结果是否稳定。
3. alternatives 是否包含真实可选路径及权衡，选定方案是否避免不必要复杂度；是否提前冻结无证据的类、文件或设计模式。
4. classification 适用的 API、Data/SQL、migration、兼容与回滚是否完整；N/A 是否有事实理由。
5. 安全、并发、一致性、observability、技术债 disposition 和测试设计是否覆盖 requirement 与主要 failure modes。
6. 是否存在隐藏的 TBD/TODO/假设或需要用户选择的内容；存在时必须 block 并返回一个可执行 correction，不能替用户决定。

机械 assertions 通过只证明基本形状。Reviewer 必须审查语义正确性，且不能修改 candidate 或批准自己的输入。
