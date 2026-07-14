# 指令分层规范

## 目的

定义本项目中不同层级指令各自负责什么，避免重复、冲突和上下文膨胀。

## 分层

### 1. 项目根 `CLAUDE.md`
负责短地图与操作合同：

- 愿景
- 做什么 / 不做什么
- 默认 workflow
- 验证入口
- 当前成熟度
- deeper rules 入口

不得承载完整细则与长篇模板。

### 2. `.claude/rules/`
负责自动加载的稳定治理规则：

- workflow
- code analysis
- documentation
- Java architecture
- Java style
- testing
- API contract
- review

### 3. `.claude/agents/`
负责独立 reviewer / specialist 的角色定义。

### 4. `.claude/skills/`
负责项目级多步骤方法入口，如 requirement intake。

### 5. `harness/specs/`
负责长期稳定、跨会话、可版本化的流程与治理知识。

### 6. `harness/changes/`
负责活动中的 change 资产与状态。

### 7. `harness/explorations/`
负责带时间戳的探索证据与 fallback 留痕。

## 原则

- 一个事实只应有一个权威来源
- 长期规范不应埋在活动 work 文档里
- 临时探索不应伪装成长期规范
- 中文用于流程资产；代码标识符保持英文
