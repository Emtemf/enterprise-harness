# 用户操作检查清单

每一步应该出现什么。如果没出现，就是不符合预期——请提 issue 反馈。

## Step 1：启动

输入 `/harness` 或打开 Claude Code 会话。

**应该看到**（session-start hook 输出）：

```
[Harness 启动检查] .claude/rules=存在 | .claude/agents=存在 | .claude/skills=存在 | ...
[Harness 入口] 普通用户入口: /harness
[Harness 进度] 当前阶段: ...
[Harness Workflow] 当前 stage: ...
[Harness Workflow] 下一步动作: /harness
```

**如果没看到**：
- 没有任何 `[Harness ...]` 开头的输出 → 插件没有正确安装，hook 没触发
- 某些字段显示"缺失" → 对应目录未安装完整，重新 `plugin install`

**这一步是程序拦截**：session-start hook 是真实的 Node.js 脚本，不依赖模型。

---

## Step 2：代码探索

Claude 在写代码之前，应该**先探索你的项目结构**。

**应该看到**：
- Claude 调用 `codegraph_explore` / `codegraph_search` 等 MCP 工具
- 或者在思考中提到"让我先探索一下项目结构"

**如果没看到**：
- Claude 直接开始写代码，没有任何代码探索过程 → **不符合预期**，请提 issue
- 这是 prompt 级约束（`codegraph-first`），弱模型可能跳过，但不应该跳过

**验证方法**：在 Claude 的思考输出里搜索 `codegraph` 关键词。如果完全没有，说明没用 codegraph。

---

## Step 3：需求澄清

Claude 应该**一次只问你一个问题**，逐步降低歧义。

**应该看到**：
- Claude 先问你想做什么
- 一次只问一个问题，而不是丢出一堆问题
- 问题应该是具体的、可以用选项回答的（"A/B/C + 其他"），而不是开放式的

**如果没看到**：
- Claude 直接开始写代码，没问过任何问题 → **不符合预期**，请提 issue
- Claude 一次丢出 5 个以上问题 → 有点急，但不算严重问题

**这一步是 prompt 约束**：`/harness` skill 要求"一次只问一个高价值问题"。

---

## Step 4：变更创建

Claude 应该为你的需求创建一个 change 目录。

**应该看到**（在某个时刻）：
- `harness/changes/<change-id>/state.json` 被创建
- `harness/ACTIVE_CHANGE` 被设置为这个 change-id

**如果没看到**：
- 一直没有任何 change 目录被创建 → 不符合预期
- Claude 直接修改你的 Java 代码，但没有创建任何 change → **不符合预期**

**验证方法**：
```bash
cat harness/ACTIVE_CHANGE    # 或 cat .harness/ACTIVE_CHANGE
ls harness/changes/           # 或 ls .harness/changes/
```

---

## Step 5：设计文档

Claude 应该在写代码之前先写出 design.md。

**应该看到**：
- `harness/changes/<change-id>/design.md` 被创建
- 里面包含：Problem、Scope、Options、测试策略等 section

**如果没看到**：
- Claude 直接开始写 Java 代码，没有先写 design → **不符合预期**
- design.md 内容太短（< 50 行） → 可能不够完整

**这一步是 prompt 约束**：`/harness` skill 要求先设计再编码。

---

## Step 6：写代码前拦截

当 Claude 尝试修改受治理路径下的 Java 文件时：

**应该看到**：
- 如果 `state.json` 里 `designApproved=false`：Claude 被 BLOCK，看到
  ```
  BLOCK: 当前目标路径需要 designApproved=true
  ```
- 如果 `ACTIVE_CHANGE` 不存在：Claude 被 BLOCK，看到
  ```
  BLOCK: 修改受治理路径（src/main/java、src/test/java、openapi 等）前，必须先设置且保持有效的 harness/ACTIVE_CHANGE
  ```

**如果没看到**：
- Claude 直接修改了 `src/main/java` 下的文件，没有被拦截 → **不符合预期**
- 看到的 BLOCK 信息里还有"reference-service"字样 → 插件版本过旧，需更新

**这一步是程序拦截**：pre-write.mjs 是真实的 Node.js 脚本。

---

## Step 7：会话结束

当会话结束时：

**应该看到**：
- 如果 validation 不是 `fresh`：stop hook 拦截，看到
  ```
  BLOCK: ... validation.status=stale ...
  ```

**如果没看到**：
- 没有任何 stop hook 输出 → 正常（validation 是 fresh 时不会拦截）

---

## 快速定位指南

| 你看到的现象 | 可能原因 | 是否符合预期 |
|---|---|---|
| Claude 没问问题直接写代码 | 弱模型跳过了 clarify | ❌ 提 issue |
| Claude 没用 codegraph 就写代码 | 弱模型跳过了 codegraph-first | ❌ 提 issue |
| Claude 写 `src/main/java` 没被拦截 | pre-write hook 没触发 | ❌ 提 issue |
| BLOCK 信息里有"reference-service" | 插件版本太旧（< 0.1.12） | ❌ 更新插件 |
| 没有 `[Harness 启动检查]` 输出 | 插件没正确安装 | ❌ 重新安装 |
| change 目录没被创建 | harness 没正常工作 | ❌ 提 issue |
| design.md 内容很短 | 模型跳过了部分步骤 | ⚠️ 提 issue |
| 会话结束后验证报错 | validation 不是 fresh | ✅ 正常行为 |

## 提 issue 时请提供

1. **你用的模型**（`/model` 查看，如 `Claude Sonnet 5` / `MiniMax-M2.7`）
2. **哪一步不符合预期**（对照上面的 Step 编号）
3. **你实际看到的输出**（粘贴具体文本）
4. **期望看到的输出**（对照上面的"应该看到"）
5. **`node harness/plugin/runtime/cli.mjs status` 的输出**
