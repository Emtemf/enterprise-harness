# Test Design 方法

Test Design 把冻结的 requirement、Architecture Design 决定和可验证性义务转换成可执行意图，但不执行任何测试，也不决定 Plan 的命令。

## 1. 守住冻结输入

只消费 marker prepare 返回的 frozen `inputRefs` 和 `inputDigests`。从 requirements 提取稳定 `R<number>`，从 Architecture Design 提取已接受的 `D<number>` 与 `VO<number>`；聊天补充、作者自报或 stale artifact 都不是事实源。

输入缺失或摘要变化时停止并返回恢复动作。缺少真实业务选择时只返回一个紧凑 `NEEDS_DECISION`，不得把 TBD、TODO、默认假设或泛化断言写进 candidate。

## 2. 从风险建立 Coverage Matrix

先列成功路径、边界和每个 `VO*` 的主要失败信号，再分配 `critical|high|normal`。每个 requirement 和 verification obligation 至少有一个适用 coverage 行并解析到真实 `TC*`。critical 关注点必须由 critical-priority case 覆盖；不适用项只能写 `N/A` 并给出可审计理由。

最小充分集合不是最少行数，而是删除任一 case 都会丢失 requirement、主要失败信号、关键边界或适用用户旅程的集合。不要为同一断言堆叠同义用例。

## 3. 写可观察用例

每个用例使用唯一 `TC<number>`，并同时 trace 已声明的 `R* / D* / VO*`。根据隔离边界选择 `unit|integration|contract|migration|security|E2E`，不把工具名当测试层级。

十个字段必须完整：前置条件可建立，数据具体且可隔离，Actions 是中文业务动作或明确 HTTP method+path，断言指向值、状态、错误或副作用，清理/恢复能消除残留。Actions 和 E2E Steps 只描述业务交互，不写 runner 命令、shell/argv 或具体浏览器驱动。前置条件可以陈述 `Node 服务已启动` 等环境事实，数据可用 JSON fence 表达。

断言按可观察证据正向判断：至少包含数字/literal、数量或唯一性、相同差异、状态码/错误码、记录字段值、创建/更新/删除/拒绝、可见性、日志/指标/事件之一。禁止只有“验证成功”“符合预期”“接口可用”等无法判定的结论。

## 4. 处理 E2E 与数据生命周期

E2E 适用时至少写一个稳定 `J<number>` journey，并引用真实 `R/D/VO/TC`；journey 描述用户跨边界的最短关键路径和可观察结果，不绑定 Playwright、浏览器 MCP 或其他执行工具。E2E 不适用时必须记录事实理由。

为共享资源、并行执行、唯一数据、故障注入、清理失败和恢复检查给出明确策略。这里设计数据和恢复意图，不创建数据、不运行浏览器或测试。

## 5. 自检与交接

运行 Task 3 的三个纯 assertions，修正 shape、coverage 和 traceability 问题。worker 不自批；Task 4 finalizer 持久化结果后，由 Main 创建不同 run 的独立 review。exact argv 只由 Plan 在后续阶段冻结。
