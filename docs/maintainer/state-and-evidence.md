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

Clarify 的 Design transition 同样从当前五个 canonical artifact、独立 review、完整 TECPC 和 generic
CompletionProof 的 digest binding 重新计算；scope/classification 状态不是旁路。proof 绑定不可变 decision
snapshot，因此之后追加到 live ledger 的事件不会使已经封存的 prefix 自动 stale。

schema、revision 和迁移见 `harness/specs/state-schema.md`；receipt 和 completion 见 `harness/specs/evidence.md`。
