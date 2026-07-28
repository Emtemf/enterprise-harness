---
name: harness-verify
description: >
  Clarify-first staged workflow 的 verify 阶段入口。用于在实现后统一消费 reviewer verdict、validation freshness、命令证据与 skipped items，判断当前 change 是否可宣称完成。适用于“进入 verify 阶段”“补 validation”“刷新 freshness”“准备结束 change”等场景。
---

# Harness Verify

plugin-only 环境从 `/enterprise-harness:harness` 进入后会路由到本阶段；standalone source checkout 继续使用裸 `/harness` 与阶段恢复入口。

plugin-installed skill 的 backend 命令必须使用同一段确定性 Bash：

```bash
if command -v enterprise-harness >/dev/null 2>&1; then
  enterprise-harness <subcommand> [args...]
elif test -f harness/plugin/runtime/cli.mjs; then
  node harness/plugin/runtime/cli.mjs <subcommand> [args...]
else
  echo "BLOCK: enterprise-harness launcher unavailable; reload/update the plugin" >&2
  exit 2
fi
```

## 目标

本阶段默认以 **Quality Engineer 视角**主导。

参与角色通常包括：
- Fullstack Developer（补实现/命令证据）
- Principal Architect（必要时确认架构与设计一致性）
- `enterprise-harness:verification-reviewer`（独立审查完成声明与 fresh evidence）
- Human User（最终业务验收）

verify 的目标是把工程验证和用户验收收成一个完成声明，而不是只跑几个命令。


## 前置条件

进入本 skill 前，至少应满足：

- 当前任务已完成 TDD 子状态推进
- `validation.md` 可更新
- reviewer verdict 可被引用或补齐

## 必须产出

- `harness/changes/<change-id>/validation.md`
- `harness/changes/<change-id>/reviews/*.json`

## 当前动作顺序（orchestrator shell 显示要求）

进入 verify 后，主 orchestrator 必须显式说明这一轮的调度顺序。

最低要求：
- 先消费 `validation.md`、reviewer verdict、当前 `state.json`
- 若证据缺口仍在：先明确需要补哪类命令/哪份 verdict
- 若需要独立复核完成声明：先按 `harness/specs/brief-contract.md` 生成 verification brief，再派 `enterprise-harness:verification-reviewer`
- 返回后只消费 `pass` / `block` / `advisory` 结论、`blockers` 与 `next-step`
- 最后再决定是否满足 archive / completion gate

## verify 必查项

1. ran commands
2. key outputs
3. skipped items
4. reviewer verdicts
5. stage gate summary
6. freshness status
7. final verdict

## 行为要求

- blocking reviewer verdict 不能被忽略
- stale validation 不能宣称完成
- 失败/重试/跳过项必须显式写入
- Stop hook 只是兜底；主 verify 阶段应先完成自我收口
- 若本次踩到值得沉淀的新坑（非一次性、后续可能重复），收尾时用
  `enterprise-harness lesson-add <slug> <severity> <tags> <changeId>`
  记录到跨 change 经验库，避免同样问题在未来重复发生

## 退出条件

- `validation.md` 完整
- reviewer verdict 已落盘
- 当前 change 的完成声明有 fresh evidence 支撑
