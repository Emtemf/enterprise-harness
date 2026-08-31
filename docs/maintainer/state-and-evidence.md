# 状态与证据

本文说明维护者应如何理解状态、权威产物和证据链；字段 schema、精确 predicate 与 CLI 输出仍以
`harness/specs/` 和 runtime 为准，不在这里复制。

## 三类存储的职责

| 类别 | 典型位置 | 职责 | 不能证明什么 |
| --- | --- | --- | --- |
| 动态状态投影 | `harness/changes/<change-id>/state.json` | 记录 `stage`、`lifecycle`、`currentTask`、revision 和 artifact 引用 | 不能单独证明阶段已经完成 |
| durable evidence | change 下的 canonical artifacts、`evidence/**/*.json`、`reviews/*.json`、`runs/<run-id>/{input,result,check}.json` | 保存可追踪输入、执行结果、独立 review、TECPC、receipt、proof 与摘要绑定 | 不能用聊天结论或手写状态替代 |
| runtime spool | Git common dir 下的私有 spool | 暂存 hook/runner 捕获的原始结果，支持跨 worktree 汇聚 | 未经 import、身份和 digest 校验前不是 durable evidence，也不进入发布包 |

`harness/ACTIVE_CHANGE` 只承担 v5 compatibility pointer；v6 的当前变更真相来自 change 自身的
`state.json`。状态是导航投影，gate 必须从当前 canonical artifacts 和 trusted evidence 重新计算。

## 当前权威证据链

```text
ResearchPackets + Decisions
  → requirements.md + classification.json + Clarify completion evidence
  → design.md + architecture execute/review + sealed ArchitectureProof
  → test-cases.md + test-design execute/review + compound DesignProof
  → tasks.md + task-commands.json + task execute/check receipts
  → validation.md + canonical per-TC verification receipts + final review
  → runtime-written archive manifest + writer attestation
```

各环节的所有者和下游约束如下：

| 环节 | 当前权威产物 | 下游必须绑定的内容 |
| --- | --- | --- |
| Clarify | `requirements.md`、`classification.json`、技术债与项目契约处置、不可变 decision snapshot，以及适用的 CodeGraph/Context7 ResearchPacket | Design 输入和分类选择必须绑定当前摘要；scope/classification 不能成为绕过 Clarify gate 的旁路 |
| Architecture Design | `design.md`、architecture StageResult、不同 run/identity 的 ReviewResult、sealed ArchitectureProof | Test Design 只能消费已封存且 fresh 的 architecture chain |
| Test Design | 独立的 `test-cases.md`、test-design StageResult 与独立 ReviewResult | runtime 组合 ArchitectureProof 与 test-design chain，形成 compound DesignProof；`test-cases.md` 是详细 `TC*` 的唯一权威 |
| Plan / Implement | `tasks.md`、`task-commands.json`、每个 task 的 strategy、phase、literal argv、write scope、`TC*` 映射，以及 execute/check receipts | Plan 同时绑定 compound DesignProof 和当前 `test-cases.md`；两个计划产物由同一 StageResult/review 绑定，Implement 只能用相应 task 的冻结输入完成工作 |
| Verify | `validation.md`、每个 accepted `TC*` 的 canonical receipt、fresh validation 与独立 final review | `unsupported` 不能提升为 pass；适用的 critical E2E 必须实际执行 |
| Archive | runtime 写入的 `evidence/archive-manifest.json` 及配对 writer attestation | manifest 绑定 compound DesignProof、`test-cases.md`、两段 test-design run、Verify completion 和逐 TC receipts；手写 manifest 不能替代 writer path |

## Freshness、stale 传播与恢复

Freshness 来自 canonical path、受信身份/run、父子关系和内容 digest 的组合校验，不来自持久化的
`ready` 或 `approved` 布尔值。上游权威输入变化时，依赖它的 proof、plan、task evidence、verification
receipt 和 archive readiness 必须按绑定关系变为 stale；runtime 返回最早失败 gate 的一个具体恢复动作，
而不是从聊天或旧状态推断已经完成。

Clarify proof 绑定不可变 decision snapshot，因此向 live Decision Ledger 追加与该封存前缀无关的事件，
不会无条件让已封存 proof stale；改变其已绑定输入则仍会失效。Design 采用两段 proof：先封存
ArchitectureProof，再由 runtime 在 test-design execute/review 通过后生成 compound DesignProof。

## 信任边界

- subagent 文本不是证据；只有经 schema、身份、run 关系、canonical path 和 digest 校验后导入的结果才参与 gate。
- executor 的 self-check 不能替代不同 run/identity 的 independent review。
- worktree 提供代码隔离，不提供证据权威或 reviewer independence。
- `state.json`、聊天输出、复制的 receipt、手写 archive manifest 都不能把缺失或 stale evidence 变成 fresh。
- 对 byte-identical canonical artifact 的重写，系统按内容摘要观察为同一输入；不要把这一性质描述成外部签名或不可篡改存储。

schema、revision 和迁移见 `harness/specs/state-schema.md`；proof、receipt、completion 与 archive attestation
见 `harness/specs/evidence.md`；阶段时序见 `docs/maintainer/runtime-sequence.md`。
