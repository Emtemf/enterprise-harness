# 快速定位指南

> 完整的 TECPC 五维验收指南见 [tecp-user-acceptance-guide.md](tecp-user-acceptance-guide.md)。
> 本文档仅提供快速对照表。

## 现象 → 原因 → 是否符合预期

| 你看到的现象 | 可能原因 | 是否符合预期 |
|---|---|---|
| Claude 没问问题直接写代码 | 弱模型跳过了 clarify | ❌ 提 issue |
| Claude 没用 codegraph 就写代码 | 弱模型跳过了 codegraph-first | ❌ 提 issue |
| subagent 标题写成 `enterprise-harness` | 主 orchestrator prompt 编排 bug——subagent 的任务标题应该指向**当前用户项目**或具体探索主题，而不是写成 `Explore enterprise-harness codebase` | ❌ 提 issue |
| 主 agent 忽略 subagent 结果又自己探索 | subagent 通信/消费契约 bug——subagent 完成后，主 agent 应基于 subagent 结论继续，而不是忽略它并重新探索相同问题 | ❌ 提 issue |
| Claude 写 `src/main/java` 没被拦截 | pre-write hook 没触发 | ❌ 提 issue |
| BLOCK 信息里有"reference-service" | 插件版本太旧（< 0.1.12） | ❌ 更新插件 |
| 没有 `[Harness 启动检查]` 输出 | 插件没正确安装 | ❌ 重新安装 |
| change 目录没被创建 | harness 没正常工作 | ❌ 提 issue |
| design.md 内容很短 | 模型跳过了部分步骤 | ⚠️ 提 issue |
| subagent 标题写成 `enterprise-harness` | 主 orchestrator prompt 编排 bug | ❌ 提 issue |
| 主 agent 忽略 subagent 结果又自己探索 | subagent 通信/消费契约 bug | ❌ 提 issue |
| 没有展示歧义评分 | 模型跳过了评分规则 | ❌ 提 issue |
| 一次问了 5 个以上问题 | 模型跳过了一问一答规则 | ⚠️ 提 issue |
| 会话结束后验证报错 | validation 不是 fresh | ✅ 正常行为 |
| BLOCK 后没有 TECPC 卡 | 插件版本过旧 | ❌ 更新插件 |

## 提 issue 时请提供

1. **你用的模型**（`/model` 查看）
2. **哪一步不符合预期**（对照 [验收指南](tecp-user-acceptance-guide.md) 的 Step 编号）
3. **你实际看到的输出**（粘贴具体文本）
4. **期望看到的输出**（对照验收指南的"预期效果"）
5. **`node harness/plugin/runtime/cli.mjs status` 的结果**
