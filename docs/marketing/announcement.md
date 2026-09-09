# Enterprise Harness：给 Claude Code 一条可验收的企业交付链

AI coding 已经能写规格、拆任务、实现代码和运行测试。企业团队面临的下一道问题是：当上下文会丢、输入会变、agent 可能越界、测试可能只是自报时，如何证明一次变更真的按批准的需求完成？

Enterprise Harness 是面向 Claude Code 的 acceptance control plane。它把 Clarify → Design → Plan → Implement → Verify → Archive 变成一条由持久化证据连接的交付协议，并由 runtime 校验 evidence digest、agent identity、worktree、write scope、真实命令 receipt、独立 review 与 freshness。

团队最终得到的不只是一次模型回答，而是一组能够复验的需求、决定、架构与测试设计、任务、实现 receipt、验证结果和归档 lineage。需求变化会使旧结论失效；缺少独立评审或真实验证时，流程停在最早的无效 gate，并给出恢复动作。

Enterprise Harness 面向的是愿意为正确产出、恢复能力和审计证据投入额外计算的团队。token 和耗时是需要观测的资源指标，但交付效果才是首要指标。

Superpowers 擅长成熟的工程方法，OpenSpec 擅长轻量、跨工具的规格资产。Enterprise Harness 专注于另一层：让 Claude Code 的企业变更过程可拒绝、可恢复、可复验。

安装后从 `/enterprise-harness:harness` 开始。查看[企业价值、选型边界与可复验证据](competitive-evidence.md)。
