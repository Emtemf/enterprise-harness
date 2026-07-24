# 代码分析与检索规则

## 总原则

Java 与后端相关分析默认 **codegraph-first**。

codegraph-first 的含义是：

1. 先尝试使用 codegraph 获取结构化证据
2. 只有在 codegraph 不可用、索引不可信、结果不足或无法覆盖目标时，才允许退回 grep / Read
3. fallback 必须记录原因与范围

## 委派约束（强制）

**【强制】代码探索必须委托 subagent**：主 orchestrator 不得自己直接用 grep/Read 搜索代码。必须通过 Agent 工具派遣 `subagent_type: code-explore`完成代码探索。这是强制委派规则，不是建议。

理由：弱模型会直接跳过 skill 指令中的委托要求，直接 grep/Read。将此约束写入自动加载规则层，确保每次会话都可见。

## 首选分析目标

分析应优先识别：

- controller / handler
- application service / use case
- domain service / policy / aggregate
- repository port / persistence adapter
- DTO / Req / Rsp / Entity / Mapper
- caller / callee / impact path

## 推荐查询策略

当 codegraph 可用时，优先采用可控的分步策略，而不是盲目依赖单次大查询：

1. status / 健康状态
2. search / 符号定位
3. impact / callers / callees / 影响分析
4. node / 关键源码补读
5. 必要时 explore 做区域综述

## fallback 触发条件

出现以下任一情况，才允许 fallback：

- codegraph MCP 工具未暴露
- server 未连接
- 项目未初始化索引
- 索引状态过旧或不可信
- 查询连续失败
- 结果缺少目标语言、模块或关键符号
- 结果无法解释关键影响面

## fallback 行为

fallback 时必须在探索证据中写清：

- `fallback_reason`
- 尝试过的 codegraph 查询
- 改用的工具（grep / Read）
- 搜索范围
- 当前证据可信度

## L3 特别规则

L3 变化在以下条件下默认 blocker：

- codegraph 不可用
- 且影响面无法通过少量人工证据可靠确认

## Artifact 要求

探索输出应沉淀到：

- `harness/explorations/`
- 或 `harness/changes/<change-id>/evidence/`

命名应包含日期、主题和产物类型。

## 禁止事项

- 不得把“我觉得不用查”当成 fallback 理由
- 不得在 codegraph 失败后静默切到 grep 而不留痕
- 不得把一次模糊查询的空结果解释为“代码不存在”
- 不得在未记录查询证据的情况下声称已完成影响分析
