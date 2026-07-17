# 评审规则

## 核心原则

本项目的评审不是礼貌性建议，而是交付门禁的一部分。

## blocking reviewers

当前默认五类 blocking reviewer：

1. requirement reviewer
2. design reviewer
3. plan critic
4. API consistency reviewer
5. verification reviewer

## advisory reviewers

后续可扩展但默认 non-blocking：

- architecture advisor
- test-design advisor
- rollout advisor

## 评审输出要求

review verdict 应结构化表达，而不是只给口头结论。

最低应包含：

- reviewer id
- target change
- verdict：`pass` / `block` / `advisory`
- findings
- evidence
- reviewedAt

## blocking 条件

以下情况默认 block：

- scope 错位或未知项未澄清
- design 不完整或与架构边界冲突
- plan 不能被下游 agent/工程师无猜测执行
- OpenAPI / controller / request-response-error 契约漂移
- 完成声明缺少新鲜验证证据
- required blocking reviewer verdict 缺失、`reviewedAt` 为空、`changeId` 不匹配，或 verdict=`block`

## 机械消费基线

当前阶段至少固定以下完成态消费规则：

- `verification-reviewer`：进入 `VALIDATED` 前 mandatory
- `api-consistency-reviewer`：仅 `impact.api=yes` 的 `REVIEWED` / `VALIDATED` 前 mandatory
- required reviewer 缺失时，`verify` 与 `stop` 应阻断完成态
- reviewer verdict 文件必须可追溯到目标 `changeId`

## 评审与实现分离

- reviewer 默认只读
- reviewer 不负责直接实现修复
- main implementer 不得自我授予 PASS

## waiver

任何绕过 block 的情况都必须：

- 明确记录原因
- 指定 owner
- 指定作用范围
- 指定到期条件

## MVP 边界

当前阶段允许 advisory reviewer 尚未实现自动调用，但 blocking reviewer 的概念、输入与输出结构必须先固定下来。
