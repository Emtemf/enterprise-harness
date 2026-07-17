# Enterprise Harness v0.1.1

> 这份 release note 主要给仓库维护者、协作者和发布阅读者看。
>
> 如果你是普通用户，请直接看安装教程：
>
> - [`installation-guide.md`](./installation-guide.md)
>
> 普通用户只需要记住：**安装插件，然后从 `/harness` 开始。**

## Release Summary

这是一个紧跟 `v0.1.0` 之后的 **patch release**，目标是补齐第一轮公开发布后发现的高优先级收尾项。

它不改变 Enterprise Harness 的整体定位，也不引入新的 runtime 行为；重点是让公开仓库对第一次访问者更完整、更清晰、更适合继续协作。

---

## What changed in v0.1.1

### 1. Added Apache-2.0 license

当前仓库已补齐：

- 根目录 `LICENSE`
- `package.json` 中的 `license` metadata

### 2. Replaced clone command placeholders

以下文档中的 clone 命令，已经从占位符替换为真实仓库地址：

- `README.md`
- `docs/zh-cn/installation-guide.md`

### 3. Documented GitHub fetch fallback strategy

补充并固化了 GitHub 页面抓取受限时的 fallback 策略：

- GitHub repo / PR / Release / Issue 页面优先使用 `gh` CLI 或 GitHub REST API
- 若通用网页抓取在 `github.com` 上失败，不应误判为页面不存在
- 遇到这类情况，优先 fallback 到 `gh`、`gh api` 或 `curl --http1.1`

---

## User-facing summary

对普通用户，这个版本最重要的理解不是 runtime 细节，而是：

1. 安装 `enterprise-harness`
2. 进入 Claude Code 会话
3. 直接从 `/harness` 开始

---

## Verification

执行：

```bash
node harness/plugin/runtime/cli.mjs verify
```

结果：

```text
Enterprise Harness Verify
OK contract and runtime checks passed.
```

---

## Documentation entry

- [安装教程](./installation-guide.md)
- [维护 / 排障指南](./maintainer-runtime-guide.md)
- [项目概览](./overview.md)
- `README.md`
