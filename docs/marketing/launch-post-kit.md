# Enterprise Harness 推广素材包

> 证据和限制以 [竞争证据基线](competitive-evidence.md) 为准。不要删除限定语后单独传播比较结论。

## GitHub About

Claude Code 企业变更治理插件：用证据先行的 Clarify、隔离设计与实施、独立评审、真实命令 receipt、freshness gate 和离线归档，把一次软件变更变成可恢复、可验证的交付记录。

## 社区短帖

很多 AI coding workflow 能写 spec、拆 task、跑测试。Enterprise Harness 关注的是更难的一层：**谁做了什么、基于哪版输入、测试是否真的执行、review 是否独立、重启后能否从证据恢复。**

它把这些规则放进 Claude Code 的 Skill + runtime：

- CodeGraph / Context7 分 lane 取证，事实没齐不进入提问；
- 用户决定绑定 requirements digest，输入变化自动 stale；
- Design、测试设计、Plan、TDD 实施、Verify、Archive 分离；
- implementer 使用 worktree/write scope，reviewer 使用独立 run；
- 归档保留可离线复验的 lineage。

Superpowers 更轻、更通用，工程方法成熟；OpenSpec 更便携，适配 30+ 工具。Enterprise Harness 的目标用户是愿意用更多前置治理换取可审计和 fail-closed 交付的 Claude Code 团队。

我们不会先宣称“更省 token”：修复后 pilot 已完成双 lane 取证与可恢复问题 checkpoint，但 Harness 的 raw token 和延迟仍最高。这个过程也抓到了 research-authority freshness 与跨语言 checkpoint detector bug；固定版本 runner、失败样本和后续正式数据都放在仓库里。

安装后唯一入口：`/enterprise-harness:harness`

## 演示脚本

最有说服力的 5 分钟演示不是让模型写一个 Todo App，而是：

1. 发起一个含现有代码、版本化 SDK 和关键业务歧义的变更；
2. 展示 code/docs 两个隔离 ResearchPacket；
3. 修改 requirements，展示旧 design/proof 自动 stale；
4. 尝试跳过独立 review 或真实 RED，展示 runtime 拒绝；
5. 中断并重启会话，从 state/receipt 恢复；
6. Verify 后归档，在没有聊天记录时复验 lineage。

## 推荐标题

- “不是让 Claude Code 更会说完成，而是让 runtime 能验证完成”
- “给 Claude Code 加一条企业交付证据链”
- “从 prompt workflow 到 fail-closed delivery protocol”

## 禁止口径

- 全面碾压 Superpowers / OpenSpec；
- 零幻觉、零事故；
- 更省 token（正式数据完成前）；
- 支持所有 coding agent；
- 一键替代企业 CI、审批或合规平台。
