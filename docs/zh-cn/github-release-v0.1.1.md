# Enterprise Harness v0.1.1

## Release Summary

这是一个紧跟 `v0.1.0` 之后的 **patch release**，目标是补齐第一轮公开发布后发现的高优先级收尾项。

它不改变 Enterprise Harness 的整体定位，也不引入新的 runtime 行为；重点是让公开仓库对第一次访问者更完整、更清晰、更适合继续协作。

---

## What changed in v0.1.1

### 1. Added Apache-2.0 license

当前仓库已补齐：

- 根目录 `LICENSE`
- `package.json` 中的 `license` metadata

这让公开仓库的使用权限更清楚，也让 GitHub 的仓库元信息更完整。

### 2. Replaced clone command placeholders

以下文档中的 clone 命令，已经从占位符替换为真实仓库地址：

- `README.md`
- `docs/zh-cn/installation-guide.md`

现在第一次访问者可以直接复制命令进行接入。

### 3. Documented GitHub fetch fallback strategy

补充并固化了 GitHub 页面抓取受限时的 fallback 策略：

- GitHub repo / PR / Release / Issue 页面优先使用 `gh` CLI 或 GitHub REST API
- 若通用网页抓取在 `github.com` 上失败，不应误判为页面不存在
- 遇到这类情况，优先 fallback 到 `gh`、`gh api` 或 `curl --http1.1`

对应更新：

- `harness/specs/tool-fallback-policy.md`

---

## Why this patch release exists

`v0.1.0` 已经完成了第一轮公开发布，但在发布后验收中，发现了两个明显的对外缺口：

1. clone 命令仍有占位符
2. 仓库缺少正式 LICENSE

这些问题不影响核心 runtime 能力，但会直接影响：

- 第一次外部访问者的体验
- 公开仓库的可信度
- 外部复用与协作的清晰度

因此将这些收尾项整理为一个单独的 patch release，更有利于让 release 页面与当前主分支状态重新对齐。

---

## Scope

`v0.1.1` 是一个 **docs / metadata / release hygiene** 级别的 patch release。

它不包含：

- 新功能
- 新 gate
- 新 runtime command
- 新 Java 样板能力
- 新平台支持承诺

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

## Closing

如果说 `v0.1.0` 是第一版正式公开 MVP，
那么 `v0.1.1` 的意义就是：

> 把这次公开发布最关键的收尾项补齐，让仓库从“已经发布”变成“发布后第一轮整理完成”。
