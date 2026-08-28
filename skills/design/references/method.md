# Design 方法

Design 把已批准需求转换成足够指导 Plan 的架构合同。它不重新澄清需求，也不提前完成代码级详细设计。

## 1. 冻结事实边界

只消费 `prepare-input.mjs` 返回的 `inputRefs`、`inputDigests` 和 classification。代码结论必须来自已持久化的 CodeGraph-first ResearchPacket；版本化外部行为必须来自 Context7-first ResearchPacket。聊天记忆和 worker 自报不是事实源。

发现输入冲突、stale 或缺少业务选择时停止：技术事实缺口回 Main 重新派 research；真实业务取舍返回一个 `NEEDS_DECISION`，不得自行补默认值。

## 2. 建立 requirement trace

为每个 `R*` 建立稳定映射：

```text
Requirement → Decision → Evidence → Verification → Rollback
```

每个引用使用模板中的 `D* / E* / V* / RB*` ID。一个通用“已覆盖”声明不能覆盖多条 requirement。

## 3. 比较方案再冻结决定

至少写出选定方案和最强替代方案。比较复杂度、兼容性、安全、运维成本及现有架构一致性；没有实际差异时不要制造虚假备选。

关键决定采用 `Context → Decision → Consequences → Status`。出现 `Status=needs-decision` 时不得生成 passing StageResult。

## 4. 定义边界与交互

设计到可供 User Story/Plan 消费的粒度：

- component/service/interface 的职责、依赖方向和事务所有权；
- 主要成功路径、失败/超时/重试路径和外部可观察结果；
- 适用的 API、错误模型、认证授权、幂等与兼容；
- 适用的数据、SQL、迁移、回填和恢复点；
- 安全、并发、一致性、observability 与测试场景。

除非现有代码事实要求固定扩展点，不在 Design 提前冻结类名、方法名和完整文件清单；这些属于 Plan 的详细设计。

## 5. 设计测试与纠正路径

每条 requirement 至少绑定一个可观察验证场景。Design 定义场景、层级、前置条件和断言；Plan 再冻结 exact argv。浏览器工具由 Verify 根据场景和环境选择，Design 不预先绑定 Playwright/MCP/DevTools。

每个高风险决定给出可执行的失败检测、恢复/回滚动作及回滚后验证。不可逆迁移必须明确恢复点，不能伪装成“可回滚”。

## 6. 自检后交给独立 Review

运行全部确定性 assertions，记录命中的下游坑点。Design worker 只能产出 self-check 和 StageResult；Main 必须创建不同 run 的 reviewer，并在 ReviewResult、TECPC 与 fresh proof 全部通过后推进 Plan。
