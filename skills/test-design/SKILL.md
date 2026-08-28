---
name: test-design
description: 从冻结输入生成持久测试用例设计。
argument-hint: HANDOFF_INPUT=<canonical-input.json-path>
user-invocable: false
context: fork
agent: enterprise-harness:test-design-worker
---

# Test Design

本 Skill 在隔离上下文中消费冻结 handoff，生成当前 change 的 `test-cases.md`；不执行测试、不修改产品代码、state、design.md 或其他阶段制品，也不替用户做业务决策。

本次唯一 handoff：

```text
$ARGUMENTS
```
