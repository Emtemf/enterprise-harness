# Enterprise Harness 发布素材

以下内容可直接用于产品介绍。完整能力、适用边界和验证证据见[企业评估页](competitive-evidence.md)。

## GitHub About

Claude Code 企业变更治理插件：用证据先行的 Clarify、隔离设计与实施、独立评审、真实命令 receipt、freshness gate 和离线归档，把一次软件变更变成可恢复、可验证的交付记录。

## 社区短帖

很多 AI coding workflow 能写 spec、拆 task、跑测试。Enterprise Harness 关注的是企业交付更难的一层：谁做了什么、基于哪版输入、测试是否真的执行、review 是否独立、中断后能否从证据恢复。

它为 Claude Code 提供一条可验收的交付链：

- CodeGraph 与 Context7 分 lane 取证，事实完成后再进入业务澄清；
- 用户决定绑定 requirements digest，输入变化自动使旧结论 stale；
- 架构设计与详细测试用例分别产出、分别独立评审；
- 计划冻结任务、命令、写入范围和回滚动作；
- implementer 在隔离 worktree 中执行真实 TDD，reviewer 使用独立身份；
- Verify 基于最终代码重新执行，Archive 保留可离线复验的 lineage。

这套机制不追求最低的首轮 token。它把计算投入到事实取证、上下文隔离和独立验证，目标是让缺少证据的工作不能成为“已验收事实”。

安装后唯一入口：`/enterprise-harness:harness`

## 五分钟演示

1. 发起一个含现有代码、版本化 SDK 和关键业务歧义的变更；
2. 查看代码与外部文档两条 ResearchPacket；
3. 修改 requirements，观察旧 design/proof 自动 stale；
4. 尝试跳过独立 review 或真实 RED，观察 runtime 拒绝；
5. 中断并重启会话，从 state、artifact 和 receipt 恢复；
6. Verify 后归档，在没有聊天记录时复验 lineage。

## 推荐标题

- “不是让 Claude Code 更会说完成，而是让 runtime 能验证完成”
- “给 Claude Code 加一条企业交付证据链”
- “从 prompt workflow 到 fail-closed delivery protocol”
