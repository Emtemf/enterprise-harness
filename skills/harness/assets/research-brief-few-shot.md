# Research Brief 少样本

只模仿相邻 lane 的一个模式，不复制示例结论。

- 好的 code 问题：`确认 OrderService.status 的当前行为、它直接引用的 OrderStatus 值，以及本类是否已有 cancel/refund；排除猜测的 Repository、DTO、Controller、全仓调用方与设计。`
- 好的 docs 问题：`仅确认 stripe-java 24.0.0 创建退款时幂等键是否适用，以及同 key 重试语义；排除辅助 builder/API convenience symbols、其它字段和退款失败后的订单策略。`
- 坏的问题：`研究取消和退款怎么做，并找全仓影响、未来兼容性和所有异常`——混合代码事实、版本事实、产品决策和设计，必然制造无关 uncertainty。

brief 的 `question` 只含一个 lane 可关闭的事实谓词；`scope` 写精确 symbol/library+version；`exclusions`
逐字排除用户拥有的业务策略和后续设计。事实源不存在时回答“未发现 + 已检查范围”，不要把不存在改写成业务 uncertainty。
若文档通过不同于提问措辞的正确 API surface 证明目标行为，应修正为 sourced fact 并关闭；不得自行增加辅助
builder/method 是否存在这一类 closure 条件。
