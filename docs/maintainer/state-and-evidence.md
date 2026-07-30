# 状态与证据

动态状态：

```text
harness/ACTIVE_CHANGE
harness/changes/<change-id>/state.json
```

durable evidence：

```text
validation.md
evidence/**/*.json
reviews/*.json
runs/<run-id>/{input,result,check}.json
```

runtime spool 位于 Git common dir 下，不进入发布包。spool 通过 import 和 digest 校验后才成为 durable evidence。

证据包括 agent ledger、TDD receipt、review verdict 和 fresh validation。`state.json` 是投影，不是自证；gate 必须从独立 artifact 重新计算。

schema、revision 和迁移见 `harness/specs/state-schema.md`；receipt 和 completion 见 `harness/specs/evidence.md`。
