# Change

## 原始需求

把 Enterprise Harness 做成可安装的 npm package/插件，让别人能通过 GitHub Release 下载 tarball 安装使用，而不是只能从源码仓库运行。这是"做成插件给别人用"目标的关键一步。

## 业务结果

1. **GitHub Release 打包**：用户通过 `git clone` 或下载 tarball 安装
2. **嵌入项目目录**：用户把包放在项目的 `enterprise-harness/` 目录下，Claude Code 自动检测并加载 hooks/rules/skills
3. **一键 release 脚本**：`npm run release` 自动 bump version、tag、push、构建 tarball、发布到 GitHub Releases
4. **完整打包**：包含所有 harness 资产（runtime CLI、hooks、rules、skills、templates、specs、agents、参考实现）

## 非目标

- 本轮不做 npm registry 发布（`npm publish`）
- 本轮不做私有 registry/GitHub Package
- 本轮不重写 install/migrate/upgrade 机制

## 归属服务 / 模块 / 业务域

- scope: plugin distribution / GitHub Release packaging
- module: `package.json`、`bin/`、`.github/workflows/`、`harness/plugin/runtime/cli.mjs`
- domain: release automation / tarball packaging

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: architecture_change, rule_change
- reason: 改变分发模型，从源码仓库运行变成可安装包；新增发布流程

## 最小探索证据

- `package.json` 已存在，`private: true` 阻止 npm 发布
- `bin/enterprise-harness.mjs` 已存在
- `npm scripts` 已定义（bootstrap、doctor、sync、verify、release-local 等）
- `prepublish-check` script 已存在
- `manifest.json` 已存在（runtime 配置）
- `release-local.mjs` 已实现 source-external smoke
- 当前没有 GitHub Actions workflow 用于自动构建/发布

## 最终路由

- final tier: L3
- owning scope: plugin distribution / GitHub Release packaging
- next focus: 先定打包结构与发布流程，再改 package.json/bin/GitHub Actions，最后 TDD 验证

## 影响矩阵

- API: no
- data: no
- architecture: yes（改变分发模型）
- rule: yes（新增发布规则）

## 需要确认的决策

1. 打包目标 → GitHub Release（用户下载 tarball）
2. 安装方式 → 嵌入项目目录（Claude Code 自动检测）
3. 打包内容 → 完整 harness 资产
4. 发布流程 → 一键 release 脚本

## 假设

- 当前仓库已具备所有 harness 资产，可以直接打包
- GitHub Actions 可用于自动构建/发布
- 用户机器上已有 Node.js >= 20

## Waiver

暂无。

## Requirement Review

该需求改变分发模型并新增发布流程，影响所有资产的分发方式，按 L3 路由合理。
