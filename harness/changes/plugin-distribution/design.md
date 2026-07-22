# Design

## Role Ownership
- 主导角色：Principal Architect 视角
- 参与角色：Fullstack Developer / Quality Engineer / Human User
- 本阶段交接物：`design.md`

## Current-State Evidence

- `package.json` 存在，`private: true`，`bin` 已注册 `enterprise-harness`
- `bin/enterprise-harness.mjs` 存在，是 CLI 入口
- `.claude/settings.json` 中 hooks 路径硬编码为 `$CLAUDE_PROJECT_DIR/harness/...`
- `manifest.json` 存在，描述 runtime layer
- `release-local.mjs` 已实现 source-external smoke
- `.github/workflows/platform-smoke.yml` 已存在（CI smoke），但没有 release 自动化的 workflow
- 没有 `.npmignore` 或 `files` 字段

## Scope / Non-goals

- 范围：
  - 新增 `install.mjs` 安装脚本，复制必要文件到用户项目
  - 新增 `package.mjs` 打包脚本，构建 tarball
  - 新增 `release.mjs` 一键 release 脚本
  - 新增 `.github/workflows/release.yml` 自动发布到 GitHub Releases
  - 改 `package.json`：新增 release/pack/install scripts
- 非目标：
  - 不做 npm registry 发布
  - 不做私有 registry/GitHub Package
  - 不重写 install/migrate/upgrade 机制（本轮的 install 是全新的"把 harness 复制到用户项目"脚本）

## Options Considered

### Option A：解压到项目根目录（覆盖合并）
- 缺点：污染项目根目录，可能与用户已有文件冲突

### Option B：子目录 + 修改 hooks 路径
- 缺点：需要修改 settings.json，迁移成本高

### Option C：安装脚本复制（选中）
- 优点：干净，用户有控制权，安装脚本只复制必要文件
- 缺点：需要额外脚本，但这是最安全的

### Option D：当前路径 + 用户接受覆盖
- 缺点：需要用户手动接受覆盖，不友好

## Selected Option and Rationale

选 C：安装脚本复制。

理由：
- 用户下载 tarball 后运行 `node install.mjs`，脚本把 hooks/rules/skills/CLAUDE.md 等复制到用户项目对应位置
- 如果用户已有 `.claude/settings.json`，安装脚本智能合并（不覆盖用户已有配置）
- 用户有完全控制权，可以选择性安装

## Rejected Options

A/B/D 如上，C 最安全且最灵活。

## Affected Layers

不涉及 Java 四层。受影响的是：
- `bin/install.mjs`（新增）
- `bin/package.mjs`（新增）
- `bin/release.mjs`（新增）
- `package.json`（新增 scripts）
- `.github/workflows/release.yml`（新增）
- `harness/specs/release-readiness.md`（更新）
- `README.md`（新增安装说明）

## Interface Contract

- External API: N/A
- Internal service contract:
  - `install.mjs`：复制 harness 资产到用户项目，智能合并 settings.json
  - `package.mjs`：构建 tarball，排除 .git/node_modules
  - `release.mjs`：bump version → tag → push → 触发 GitHub Actions
- Compatibility / caller impact:
  - 不影响现有用户（当前仓库继续按源码仓库运行）
  - 新增的 install.mjs/package.mjs/release.mjs 是独立入口

## Data / SQL Design
- N/A

## Messaging / Event / MQ Design
- N/A

## Architecture Boundary
- 新增脚本在 `bin/` 目录，与现有 `bin/enterprise-harness.mjs` 并列
- 不改动现有 runtime CLI 逻辑

## Flow / State Changes

发布流程：
1. 维护者运行 `npm run release`
2. `release.mjs` 读取当前版本，bump（patch/minor/major）
3. 更新 package.json + manifest.json + CHANGELOG.md
4. git tag `v{version}` + commit + push
5. GitHub Actions `.github/workflows/release.yml` 检测到 tag
6. Actions 运行 `package.mjs` 构建 tarball
7. Actions 创建 GitHub Release，附带 tarball

安装流程：
1. 用户从 GitHub Release 下载 tarball
2. 解压到临时目录
3. 运行 `node install.mjs`（指定目标项目路径）
4. 脚本复制 hooks/rules/skills/CLAUDE.md/AGENTS.md 到目标项目
5. 智能合并 `.claude/settings.json`

## Cross-layer Type and Mapper Matrix
- N/A

## Repository Port Design
- N/A

## API Contract
- N/A

## Error Handling

- install.mjs：
  - 目标项目不存在 → 报错并退出
  - settings.json 已存在 → 智能合并，不覆盖用户配置
  - 文件复制失败 → 回滚已复制文件
- release.mjs：
  - 版本已存在 → 报错并退出
  - git 操作失败 → 报错并退出
- GitHub Actions：
  - 构建失败 → 不创建 Release
  - 发布失败 → 保留构建产物供手动重试

## Transaction Boundaries
- N/A

## Testing Strategy

新增 smoke：`install-contract-smoke.mjs`
- RED：install.mjs 不存在时失败
- GREEN：
  - install.mjs 运行成功
  - 目标项目出现 .claude/settings.json、CLAUDE.md 等
  - settings.json 智能合并（保留用户已有 hooks）

新增 smoke：`package-contract-smoke.mjs`
- RED：package.mjs 不存在时失败
- GREEN：
  - package.mjs 构建成功
  - tarball 不含 .git/node_modules
  - tarball 含所有必要 harness 资产

新增 smoke：`release-workflow-smoke.mjs`
- RED：release.mjs 不存在时失败
- GREEN：
  - release.mjs --dry-run 成功
  - 显示将要执行的步骤

- Integration: N/A
- Backend API E2E: N/A
- RED path：先写 smoke 观察 RED，再实现

## Rollout and Rollback

- Rollout：新增脚本与 GitHub Actions，不影响现有用户
- Rollback：删除新增脚本和 workflow，回退 package.json

## Risks

- GitHub Actions 配置可能因权限/secret 问题失败
- install.mjs 智能合并 settings.json 可能遗漏边界情况
- tarball 体积可能偏大（包含 reference-service）
- 缓解：先做 dry-run 模式，先本地验证再推 Actions

## Open Questions

- CHANGELOG.md 格式：手动维护还是自动生成？
  - 本轮：手动维护，release.mjs 只 bump version
- tarball 是否包含 reference-service？
  - 本轮：包含（用户可选），作为可选参考实现

## Design Self-Review

- 覆盖接口：install/package/release 三脚本 + GitHub Actions ✅
- 覆盖测试策略：三 smoke + RED path ✅
- 覆盖错误处理：安装/发布/Actions 三层 ✅
- 覆盖回滚：可独立删除 ✅
- 符合非目标：无 npm registry、无私有 registry ✅

## Approval

待 design-reviewer 出具非 block verdict 后，置 `approvals.design` 与 `gates.designApproved`。
