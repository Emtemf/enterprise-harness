# Test Design rubric

Reviewer 只消费冻结的 requirements、Architecture Design、test-cases candidate、StageResult 与 input digests，不读取 worker 对话。逐项给出 evidence-bound verdict：

1. 每个 requirement 与 verification obligation 是否由唯一、语义匹配的 coverage 行和真实 `TC*` 覆盖；每个 TC 是否同时 trace 已声明的 `R* / D* / VO*`，而不是只让 ID 出现在任意文本。
2. 成功、失败、边界、超时/重试、恢复信号是否足以暴露 Architecture Design 的主要 failure modes；critical 风险是否有 critical-priority case，最小充分集合是否能解释删除代价。
3. 每个十列 case 的前置是否可建立、数据是否具体可隔离、Actions 是否为中文业务动作或明确 HTTP method+path、断言是否包含数字/literal、数量/唯一性、状态码/错误码、记录字段值、变更/拒绝、可见性或日志/指标/事件等可判定证据、清理/恢复是否处理残留。“接口可用”或“验证成功”必须 block。
4. 测试层级 `unit|integration|contract|migration|security|E2E` 是否与边界匹配；Actions 与 E2E Steps 不得选择 runner、shell/argv 或具体 browser/driver/DevTools/MCP。前置中的技术名和数据章节的 JSON fence 不是执行指令，不得误拦。
5. E2E 适用时是否有最短关键用户旅程并闭合引用；不适用项是否有事实理由。数据唯一性、并行隔离、故障注入、清理失败与恢复检查是否完整。
6. 是否存在重复/不稳定 ID、未知引用、空字段、TBD/TODO/待定/按需、无理由 N/A 或需要用户选择的内容；存在时必须 block 并给出一个可执行 correction，不能替用户决定。
7. candidate 是否仅设计测试而未执行测试、调用浏览器、修改产品代码或把 self-check 当 approval；任一越界都必须 block。

机械 assertions 只证明基本形状、覆盖与引用闭合。Reviewer 必须审查用例是否真的能证伪需求与失败路径，且不能修改或批准自己的输入。
