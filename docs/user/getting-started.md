# 开始一次受治理的变更

在目标项目中运行 `/enterprise-harness:harness` 并描述变更。Clarify 不会立刻采访你：Harness 先判断
代码与外部文档事实是否适用，派相应的 CodeGraph-first / Context7-first worker，并等待 required 结果校验、
持久化且保持 fresh。代码位置、调用链、框架版本等可查事实由 worker 回答，不会转问用户。

事实门禁通过后，主会话先展示 evidence-derived scope，再一次只呈现一个真正需要你决定的问题。每个问题
在显示前都绑定当前证据并由 runtime 预授权；你的选择会作为公开 DecisionEvent 追加到 change 的决策记录，
随后 Harness 重新计算最弱或最高风险的缺口。决策记录只保留选项、选择、公开理由和证据，不保存聊天全文
或隐藏推理。

精确需求可能走 Fast Path，但仍会完成事实确认、最终 scope 授权、技术债与项目合同处置、classification、
独立 review 和 fresh proof。Clarify 只审计现有项目指令并记录缺口或冲突；这个 slice 不会创建、修改或写入
`CLAUDE.md`。出现中断时，Harness 复用 fresh artifacts，只执行 status/recover 返回的一个恢复动作。

安装与命令入口见[快速开始](quickstart.md)，完整阶段行为见[六阶段工作流](workflow.md)。
