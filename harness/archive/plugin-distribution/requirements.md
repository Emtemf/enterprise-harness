# Requirements

## 原始需求

把 Enterprise Harness 做成可安装的 npm package/插件，让别人能通过 GitHub Release 下载 tarball 安装使用。

## 澄清后的目标

通过 GitHub Release 发布完整 harness 包，用户下载后嵌入项目目录，Claude Code 自动检测。

## 范围

- `package.json` 改为 `private: false`（或保持 private 但支持 GitHub Release）
- 新增 GitHub Actions workflow 自动构建/发布
- 新增 `npm run release` 一键 release 脚本
- 新增 `.npmignore` 或 `files` 字段控制打包内容
- 确保 tarball 包含所有 harness 资产

## 非目标

- 不做 npm registry 发布（`npm publish`）
- 不做私有 registry/GitHub Package
- 不重写 install/migrate/upgrade 机制

## 关键参与者 / 用户 / 调用方

- 用户：插件使用者（陌生用户）
- 调用方：GitHub Actions（自动构建/发布）
- 维护者：手动触发 release

## 业务上下文

第一性目标是"做成插件给别人用"。当前只能从源码仓库运行，需要变成可安装包。

## 约束

- 用户机器上已有 Node.js >= 20
- GitHub Actions 可用于自动构建/发布
- 打包内容不能包含 `.git`、`node_modules` 等

## 接口 / API 关注点

无对外 API 变化（api=no）。

## 数据 / SQL 关注点

无持久化 / SQL 变化（data=no）。

## 验收标准

1. `npm run release` 可成功构建 tarball
2. tarball 包含所有 harness 资产（runtime、hooks、rules、skills、templates、specs、agents）
3. GitHub Release 自动创建并附带 tarball
4. 用户下载 tarball 后，嵌入项目目录，Claude Code 能自动检测
5. `enterprise-harness` CLI 命令在 tarball 安装后可用

## 歧义评分

- Goal clarity: 5/5
- Scope clarity: 5/5
- User/actor clarity: 5/5
- Data/SQL clarity: 5/5（无）
- Interface/API clarity: 5/5（无）
- Acceptance criteria clarity: 4/5（"Claude Code 自动检测"机制待确认）
- Constraint/risk clarity: 4/5（GitHub Actions 与 tarball 结构待确认）
- Overall: 可进入 design

## 当前最弱维度

"Claude Code 自动检测嵌入目录"的具体机制待确认——是靠 `.claude/` 目录存在，还是靠 `manifest.json`，还是靠其他方式？

## 需要继续澄清的问题

无阻断性问题；上述最弱维度在 design 阶段解决。

## Repo / 文档事实依据

- `package.json` 已存在，`private: true`
- `bin/enterprise-harness.mjs` 已存在
- `manifest.json` 已存在（runtime 配置）
- `release-local.mjs` 已实现 source-external smoke
- 当前没有 GitHub Actions workflow

## 用户确认

- 状态：已确认
- 已确认范围：GitHub Release + 嵌入目录 + 完整打包 + 一键 release
- 备注：用户目标是做成插件对外分发，优先"可安装+可验证"
