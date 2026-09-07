# Enterprise Harness 对外公告

我们正在开源一套面向 Claude Code 的企业软件变更治理插件。

Superpowers 已经很好地回答了“怎样 brainstorming、TDD 和用 subagent review”；OpenSpec 很好地回答了“怎样用轻量 artifacts 管理规格”。Enterprise Harness 选择继续回答：

> 当上下文会丢、输入会变、agent 会越界、测试可能只是自报时，团队如何证明这次变更真的按批准的需求完成？

Enterprise Harness 的答案是把交付拆成 Clarify → Design → Plan → Implement → Verify → Archive，并让 runtime 校验 evidence digest、agent identity、worktree、write scope、真实命令 receipt、独立 review 与 freshness。无法证明时，流程停在最早的无效 gate，而不是继续生成看似完整的文档。

它的边界也很明确：当前只面向 Claude Code，流程比 Superpowers 和 OpenSpec 更重，首轮内部 pilot 也没有证明 token 更省。我们的推广证据会包含失败样本、固定竞品版本、相同 prompt、原始 usage 和盲审规则，而不是只展示成功 demo。

普通用户安装后从 `/enterprise-harness:harness` 开始。完整比较、配图、数据与禁止主张见 [竞争证据基线](competitive-evidence.md)。
