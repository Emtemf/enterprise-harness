# Change

## 原始需求

用户反馈当前 README 没有真正反映最新 install/verify/runtime contract，且当前接入方式不像 Claude 插件那样直接，不够容易安装。

## 业务结果

让仓库对外的安装与使用说明更接近“Claude 插件/CLI 可安装产品”的心智模型，同时保持当前真实能力边界：

- README 清楚说明当前支持的三种入口：`node harness/plugin/runtime/cli.mjs`、`node bin/enterprise-harness.mjs`、`npx enterprise-harness` / 全局 bin（若从包内容执行）
- README 明确区分“当前最稳主路径仍是 clone 仓库”与“已经具备类插件入口骨架，但尚未宣称 registry 发布完成”
- bin 入口与文档对齐，降低首次接入成本

## 非目标

- 不在本轮承诺已发布到 npm registry
- 不在本轮重构整个 packaging/distribution 流程
- 不在本轮扩展新的 runtime contract 语义
- 不在本轮修改 Java sample / API / workflow gate

## 归属服务 / 模块 / 业务域

- scope: runtime installability / docs productization
- owning module: `README.md`, `docs/zh-cn/installation-guide.md`, `docs/zh-cn/overview.md`, `bin/enterprise-harness.mjs`, `package.json`, `harness/plugin/manifest.json`
- business domain: plugin-like install surface / onboarding clarity / runtime CLI packaging façade

## 初步路由

- request shape: modify
- candidate tier: L1
- reason: 当前主要是 README/安装路径/product wording 与 bin install surface 对齐，不改变 API/data 语义，也不引入新的 architecture rule gate

## 最小探索证据

- `package.json` 已声明 `bin.enterprise-harness = bin/enterprise-harness.mjs`，但 README 仍把 clone 仓库后 `node harness/plugin/runtime/cli.mjs ...` 作为几乎唯一主路径
- `bin/enterprise-harness.mjs` 当前只是薄包装到 `harness/plugin/runtime/cli.mjs`，说明“类插件/CLI 入口”已经存在骨架
- `harness/plugin/manifest.json` 已列出 runtime commands 与 supportedOs，但 README / 安装教程没有把它整理成清晰的“安装方式矩阵”
- `docs/zh-cn/installation-guide.md` 已提到 bin 入口和 npm scripts，但 README 首页仍未把它提升为更像插件的接入文案

## 最终路由

- final tier: L1
- owning scope: docs/installability polish around existing runtime bin entry
- next focus: 先收紧 README / 安装文档 / bin 行为，再决定是否需要补充更强 packaging smoke

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: no

## 需要确认的决策

- 当前对外推荐文案采用“双轨”：默认推荐 clone path，同时明确给出 `node bin/enterprise-harness.mjs` / `npx enterprise-harness` 心智入口
- 未真正发布 registry 前，不把 `npx enterprise-harness` 写成已验证主路径，只写成“面向未来的类插件入口骨架”或“包内/本地 install 入口”

## 假设

- 当前用户关切主要在“更好安装”和“README 没跟上实现”，不是要求立刻接入真实 Claude 插件市场发布能力

## Waiver

暂无。

## Requirement Review

该需求属于 runtime docs / installability 收口，保持在 README / bin / package façade 范围内，按 L1 路由合理。
