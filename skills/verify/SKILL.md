---
name: verify
description: 汇集新鲜验证结果与独立完成证据。
user-invocable: false
context: fork
---

# Verify

执行冻结的 validation command，并汇集当前 task receipt、self-check、review、waiver 与适用的 API/data/security evidence。validation 必须绑定 input digest、对当前 tree 保持 **fresh**，并明确记录 failure、skip 与 unsupported input。

## Quality loop

最终 completion verdict 必须来自独立 `reviewer` run。需要用户决策时返回 `NEEDS_DECISION`；不得在该 forked methodology 中调用用户交互工具。