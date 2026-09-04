# Plan 自检

确认 design、test-cases 和 compound DesignProof 都是当前 handoff 的 digest-bound 输入；`tasks.md` 与
`task-commands.json` 拥有完全相同的 task id、strategy、TC 映射和最小 RED case（若适用）。逐 task
核对 phase 顺序、literal argv、允许/禁止写入范围、设计决定/模式理由、SQL migration 历史、验收和恢复动作。
反向遍历全部 accepted `TC*`，确认无遗漏；migration level 只能由 migration strategy task 承接。
