# Enterprise Harness v0.1.0

> 这份 release note 主要给仓库维护者、协作者和发布阅读者看。
>
> 如果你是普通用户，请直接看安装教程：
>
> - [`installation-guide.md`](./installation-guide.md)
>
> 普通用户只需要记住：**安装插件，然后从 `/harness` 开始。**

## Release Positioning

`v0.1.0` 是 Enterprise Harness 的第一版公开 MVP。

它代表的是：

- 一个可运行的 repo contract + portable runtime MVP
- 一个围绕 Claude Code 的企业后端交付骨架
- 一个已经开始把 change、validation、review 和 runtime 接进工程流程的系统雏形

对普通用户，这一版的对外入口应理解为：

1. 安装插件
2. 直接从 `/harness` 开始

更底层的 runtime / maintainer layer 说明保留给维护层文档。

---

## Quickstart

普通用户主路径：

1. 获取仓库
2. 安装 `enterprise-harness`
3. 打开 Claude Code
4. 输入 `/harness`

更低层的 runtime 初始化、adapter、doctor / sync / verify / upstream-check 说明，请改看：

- [`maintainer-runtime-guide.md`](./maintainer-runtime-guide.md)

---

## What This Release Is Not

为了避免误解，这个版本不应被表述成：

- 完整企业级强门禁平台
- 已 fully productized 的公开安装插件
- 所有路径都已接入同等强度 gate 的系统
- 所有本机环境都零差异支持的成品

---

## Documentation

### First read for regular users
- `README.md`
- `docs/zh-cn/installation-guide.md`
- `docs/zh-cn/overview.md`

### Maintainer / deeper docs
- `docs/zh-cn/maintainer-runtime-guide.md`
- `CLAUDE.md`
- `harness/specs/plugin-runtime.md`
- `harness/specs/local-runtime-adapter.md`
- `harness/specs/platform-validation-matrix.md`

---

## Closing

**Enterprise Harness v0.1.0** 更像是一个公开、真实可运行、可继续产品化的第一版骨架。

对普通用户，入口已经尽量收口为：**安装后直接从 `/harness` 开始。**
