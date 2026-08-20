# Design 方法

设计输入由 `scripts/prepare-input.mjs` 冻结：已确认的 requirements、classification、impact 与 digest-bound research facts 是唯一事实来源。

## 方法论来源

Design 方法融合自 superpowers brainstorming（obra/superpowers）：

1. **先理解**：clarify 已完成，requirements 和 topology 已确认
2. **再设计**：基于代码事实和文档事实，形成 component boundaries、interfaces、error model
3. **用户确认关键决策**：涉及产品行为或架构权衡的决策返回 NEEDS_DECISION
4. **才进入 plan**：设计完成后才创建 executable tasks

## 设计流程

### 1. Requirement 映射

先将每个 requirement 映射到：

- 设计决策
- 边界条件
- 验证方式
- 回滚策略

没有事实支持的结论必须明确为假设或 `NEEDS_DECISION`。

### 2. Component Boundaries

对每个 component 确定：

- 接口边界（输入/输出/error）
- 依赖关系
- 数据模型影响
- 并发/一致性考虑

### 3. Impact 条件分支

API 与 Data 不是固定章节。仅当 `impact.api` 或 `impact.data` 为 `yes` 时，读取相应条件参考文件：

- [API 设计](api-design.md) — 当 impact.api=yes
- [数据设计](data-design.md) — 当 impact.data=yes

不适用的维度记录 `N/A` 与理由。

### 4. 风险与兼容性

- 关键 failure modes 必须覆盖
- API change 必须处理 compatibility
- Data change 必须处理 migration / rollback
- 必须明确是否引入不必要架构
- 必须检查是否存在更简单的方案

### 5. 验证路径

每个设计决策必须可验证：

- 用什么测试证明这个决策是正确的
- 失败时如何回滚
- 验证覆盖了哪些场景

## 设计原则

- 基于现有代码事实（CodeGraph 确认），不凭空设计
- 基于正确版本的外部 API（Context7 确认），不用 Claude 记忆中的旧 API
- 简单优于复杂；有更简单方案时不引入不必要架构
- 不可验证的设计决策不存在
