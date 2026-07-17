---
description: 面向普通用户的单一前门。直接从 /harness 开始，由系统负责把你带到 clarify / route / design / plan / tdd / verify / archive 的下一步。
---

# /harness

这是 **Enterprise Harness 面向普通用户的唯一前门**。

你不需要先理解：

- runtime CLI
- hooks
- change state
- bootstrap / doctor / sync / verify
- lifecycle / workflow 后台命令

只需要：

1. 安装好 `enterprise-harness`
2. 在 Claude Code 会话里输入 `/harness`

然后系统会负责：

- 判断当前 active change 和当前阶段
- 告诉你当前缺口
- 把你带到下一步（clarify / route / design / plan / tdd / verify / archive）
- 在打断后提供恢复入口

如果你是 maintainer / operator / 排障者，再去看：

- `docs/zh-cn/installation-guide.md`
- `harness/plugin/runtime/ONBOARDING.md`
- `node harness/plugin/runtime/cli.mjs ...`

普通用户到这里就够了：**直接从 `/harness` 开始。**
