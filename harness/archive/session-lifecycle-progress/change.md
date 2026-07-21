# Change

## 原始需求

用户希望 Enterprise Harness 在新会话打开时，能够更快回答并加载以下问题，而不是反复让人重新解释：

- 这是什么系统
- 怎么组织的
- 怎么跑
- 怎么验证
- 现在做到哪里了

同时，用户希望结束会话时，不要把可恢复结论只留在聊天记录里，而应有更明确的持久化落点与 handoff 指引。参考形态包括：`AGENTS.md` / `README.md` 作为系统前门、架构/模块文档作为组织视图、运行命令与验证命令作为操作入口，以及 `PROGRESS.md` / 功能清单 / git 历史这类进度面。

## 业务结果

为 Enterprise Harness 增加一层更明确的 session lifecycle 能力：

- repo-facing 的进度面
- 会话启动时的全局摘要
- 会话结束时的 handoff / memory 边界提醒

目标不是制造新的聊天记忆依赖，而是让新会话更容易从仓库真相恢复上下文。

## 非目标

- 不实现“自动把 Claude memory 写回仓库”
- 不把聊天记录声明为仓库内唯一真相源
- 不在本轮引入新的业务 API、数据模型或参考服务功能改造
- 不把 `PROGRESS.md` 做成自动从 git 历史实时生成的系统

## 归属服务 / 模块 / 业务域

- service/domain: `harness-governance`
- module: repo contract / runtime lifecycle / session lifecycle
- slice: session-start + progress surface + stop handoff

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: architecture_change, platform_rule_change

## 最小探索证据

- `harness/plugin/runtime/hooks/session-start.mjs` 当前只做目录存在性检查与入口提示，不回答“现在做到哪里了”。
- `harness/plugin/runtime/hooks/stop.mjs` 当前只做 validation freshness / missing validation gate，不提供 handoff 或 memory 边界提醒。
- 仓库根当前不存在 `PROGRESS.md`、`STATUS.md`、`ARCHITECTURE.md` 这类单页进度面。
- 当前“做到哪里了”主要分散在 `README.md`、`harness/specs/mvp-roadmap.md`、`harness/ACTIVE_CHANGE`、`harness/changes/*/state.json` 中。
- legacy shell `hooks/session-start.sh` 已有“请以仓库文件为准，不以聊天记忆为准”的提醒，但 Node `SessionStart` hook 尚未承接这一语义。

## 最终路由

- final tier: L3
- owning scope: session lifecycle / repo contract / runtime hooks / status surface
- focus: `PROGRESS.md` + top-level `status` 命令 + SessionStart 摘要 + Stop handoff guidance

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

本轮已冻结以下路径型决策：

- 采用“静态 `PROGRESS.md` + 动态 `status` 命令”的双层进度面
- 动态真相优先级固定为：`harness/ACTIVE_CHANGE` + `harness/changes/*/state.json`；`PROGRESS.md` 只承载阶段快照与阅读入口
- `status` 作为新的 top-level runtime CLI 子命令接入 `cli.mjs`，而不是继续把 session/progress 语义塞进 `lifecycle.mjs`
- Stop 只输出 handoff / memory 边界提醒，不宣称自动写 memory

## 假设

- Node hook 是当前 canonical runtime 实现；legacy shell hook 只保留兼容与过渡价值
- `PROGRESS.md` 记录阶段性快照与入口，而不是每次改动后自动实时生成
- 会话外部 memory 仍属于 Claude 环境能力，不应被冒充为 repo 内建机制

## Waiver

暂无。

## Requirement Review

该需求属于 repo contract 与 runtime lifecycle 的平台级路由收紧：会同时触达 stable spec、repo-facing docs、runtime CLI、SessionStart/Stop hooks 与 contract verification，因此按当前仓库规则应作为 L3 执行，而不是 L2 文档增强。
