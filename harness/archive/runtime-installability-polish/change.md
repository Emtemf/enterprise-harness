# Change

## 原始需求

用户反馈当前 README 没有真正反映最新 installability 实现，而且当前接入方式“不像 Claude 插件”，第一次使用时需要先理解一堆 runtime/backend 命令，认知负担过高。

## 业务结果

把当前仓库对普通用户的外显路径收口成一条几乎不需要解释的主路径：

- 先把仓库作为 Claude Code **本地 marketplace** 添加
- 再安装 `enterprise-harness` 插件
- 安装完成后，**只需要记住 `/harness`**

同时保持真实能力边界：

- 当前已经具备 **本地 marketplace install / update** 路径
- 当前仍保留 clone + direct CLI / bin 作为 fallback / maintainer path
- 当前不宣称已经发布到公共 marketplace 或 npm registry

## 非目标

- 不在本轮承诺已发布到公共 marketplace
- 不在本轮承诺已完成 npm registry 发布闭环
- 不在本轮扩展新的 runtime contract 语义
- 不在本轮修改 Java sample / API / workflow gate
- 不在本轮补做 plugin install 后 hooks 真实触发的运行时 E2E

## 归属服务 / 模块 / 业务域

- scope: runtime installability / onboarding clarity / plugin-first docs polish
- owning module: `README.md`, `docs/zh-cn/installation-guide.md`, `docs/zh-cn/overview.md`, `AGENTS.md`, `.claude-plugin/*`, `hooks/hooks.json`, runtime smoke tests, change assets
- business domain: 小白用户安装心智收口、plugin-first 安装入口、`/harness` single-entry workflow

## 初步路由

- request shape: modify
- candidate tier: L1
- reason: 当前主要是 installability 入口、plugin metadata、用户文档与 durable assets 对齐，不改变 API/data 语义，也不引入新的 architecture rule gate

## 最小探索证据

- `.claude-plugin/plugin.json` 与 `.claude-plugin/marketplace.json` 已存在，说明本地 marketplace install surface 已具备最小资产
- `hooks/hooks.json` 已存在，说明 plugin-mode hooks payload 已落地
- `harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs` 已机械覆盖 validate / add / install / list / update
- `harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs` 已机械覆盖 README / 安装教程 / overview / AGENTS 的 plugin-first 文案
- README / 安装教程已经把普通用户入口收口为 `/harness`，backend 命令降级为 maintainer / 排障附录

## 最终路由

- final tier: L1
- owning scope: plugin-first installability + single-entry onboarding + durable change asset alignment
- next focus: 用 requirements / design / tasks / validation / state 把已落地事实补齐，而不是继续发散做新分发机制

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: no

## 需要确认的决策

- 对普通用户默认只暴露：安装插件，然后从 `/harness` 开始
- clone path、bin path、runtime CLI path 继续保留，但都视为 fallback / maintainer path
- 在未真正发布公共 marketplace 前，只宣称“本地 marketplace 可安装/可更新”，不宣称“官方市场可直接搜索安装”

## 假设

- 用户真正关心的是“第一次使用几乎不需要理解内部结构”，而不是立刻完成公共插件市场发布
- 当前本地 marketplace 路径已经足够支撑“像 superpowers 一样安装”的最低可用体验

## Waiver

- 当前 plugin install 后 hooks 的真实运行时触发未纳入本轮 fresh evidence；后续若要把 plugin 体验进一步产品化，应单开 change 做补强。

## Requirement Review

该需求属于 runtime docs / installability / onboarding 收口，保持在 plugin metadata、文档、smoke 与 durable assets 范围内，按 L1 路由合理。