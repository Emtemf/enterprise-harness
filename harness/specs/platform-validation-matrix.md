# 平台验证矩阵

## 目标

把当前 Enterprise Harness 的跨平台状态从“理论兼容”升级为“可计划验证”的矩阵，明确每个平台：

- 已验证什么
- 还没验证什么
- 最小 smoke test 是什么
- 哪些问题会阻塞发布

## 当前矩阵

| 平台 | 当前状态 | 已验证能力 | 未验证能力 | 备注 |
|---|---|---|---|---|
| Linux | 已实测 | repo contract、runtime CLI、local adapter、doctor、sync、verify、hook adapter smoke tests | 公开发布后安装路径 | 当前主要开发环境 |
| macOS | 设计兼容，待真机验证 | Node runtime 路径设计 | 真机执行、路径/权限细节 | 不应宣称已验证 |
| Windows | 设计兼容，待真机验证 | Node runtime 路径设计 | 真机执行、路径分隔符、APPDATA adapter 写入 | 不应宣称已验证 |

## 最小 smoke test

### Linux
1. `node harness/plugin/runtime/cli.mjs bootstrap`
2. `node harness/plugin/runtime/cli.mjs setup-local-adapter --write`
3. `node harness/plugin/runtime/cli.mjs doctor`
4. `node harness/plugin/runtime/cli.mjs sync`
5. `node harness/plugin/runtime/cli.mjs verify`
6. `node harness/plugin/runtime/cli.mjs upstream-check`

### macOS
1. 安装 Node >= 20
2. 运行与 Linux 相同的 6 步 smoke test
3. 额外检查 local adapter 默认路径是否正确落在 `${XDG_CONFIG_HOME:-~/.config}` 或团队约定的替代位置
4. 额外检查 `codegraph` 与 `ctx7` 命令在 PATH 中的可见性

### Windows
1. 安装 Node >= 20
2. 运行与 Linux 相同的 6 步 smoke test
3. 额外检查 `%APPDATA%/enterprise-harness/local-adapter.json` 写入是否成功
4. 额外检查 `codegraph`、`npx ctx7`、`enterprise-harness` bin 入口是否可执行
5. 额外检查 runtime hook adapter 在 Windows 路径分隔符下是否仍能正确拦截 governed path

## 阻塞发布的问题

以下问题如果存在，应阻塞“正式对外安装”宣称：

- 统一 CLI 入口无法运行
- local adapter 无法写入或无法读取
- doctor / sync / verify 不能输出稳定结果
- codegraph-first 在已安装环境中不可用
- Windows 或 macOS 出现路径解析错误而未有明确 workaround

## 可接受的当前 warning

当前阶段允许但必须明说：

- `CONTEXT7_API_KEY` 缺失可作为 warning，不是 hard fail
- Context7 主路径依赖 CLI wrapper，未来才考虑更强 MCP / package 分发策略
- shell 过渡实现尚未完全退场

## 验证记录要求

每次平台真机验证都应至少记录：

- 平台与版本
- Node 版本
- codegraph 版本
- ctx7 版本
- 执行的 smoke test 命令
- 成功 / 失败项
- 任何 workaround

## 结论

当前仓库可以对外说：

> Linux 已实测；macOS / Windows 已有可运行的跨平台入口设计与检查矩阵，待真机验证后再提升支持等级。
