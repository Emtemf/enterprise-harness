# Test Design 自检

提交 candidate 前逐项检查：

1. marker prepare 的 change/run identity、`inputRefs` 与 `inputDigests` 仍新鲜；只读取了 frozen requirements 和 Architecture Design 输入。
2. 每个 `R*` 与 `VO*` 都有 applicable coverage 并解析到真实 `TC*`；每个 TC 同时引用已声明的 `R* / D* / VO*`。
3. 每个 critical failure 都由 critical-priority TC 覆盖；成功、失败、边界与恢复信号可从 observable assertion 判定。
4. 每个 TC 恰好十列，ID、level、priority、status 均使用允许值；没有空字段、泛化“验证成功”或模板占位符。
5. E2E 适用时存在至少一个闭合 `J* → R*/D*/VO*/TC*` journey；不适用时 `N/A` 有事实理由。
6. 数据唯一性、并行隔离、清理失败、故障恢复和残留检查明确；最小充分集合的删除代价可说明。
7. 没有执行测试、调用浏览器、选择工具或冻结 exact argv。
8. 缺少真实业务选择时返回一个 `NEEDS_DECISION` 并停止；stale input、placeholder 或未决项不得伪装为 pass。
9. `artifact-shape`、`coverage`、`traceability` 全部通过；self-check 只写 pass/block，不写 approved。
10. Task 4 finalizer 可用后才持久化 StageResult；随后由 Main 创建不同 run 的独立 review。
