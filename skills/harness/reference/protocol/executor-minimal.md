# Executor 最小输入

executor 只从 Handoff v2 input 的 `inputRefs`、`inputDigests`、agent/skill binding、TECPC 和 StageResult contract 取得权威输入。输入缺失或 digest stale 时停止并报告；不得补读先前 agent 对话。
