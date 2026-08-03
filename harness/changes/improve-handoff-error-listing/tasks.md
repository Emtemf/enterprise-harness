# Tasks

Status: finalized-plan

## Task 1: 列出合法 behavior 列表

**Files**

- Modify: `runtime/lib/handoff.mjs`（line 74 throw 文案）
- Modify: `runtime/test/handoff-contract-smoke.mjs`（新增断言）

**Exact TDD commands**

```bash
node runtime/cli.mjs tdd-run improve-handoff-error-listing task-1 red -- node runtime/test/handoff-contract-smoke.mjs red
node runtime/cli.mjs tdd-run improve-handoff-error-listing task-1 green -- node runtime/test/handoff-contract-smoke.mjs green
node runtime/cli.mjs tdd-run improve-handoff-error-listing task-1 refactor -- node runtime/test/handoff-contract-smoke.mjs verify
```

**RED assertion**

用不合法 behavior（如 `exploration`）调用 `createHandoffInput`，断言：
1. 抛出错误
2. 错误消息包含 `legal behaviors:`
3. 错误消息包含至少一个已知合法 behavior（如 `clarify.explore-code`）

**GREEN**：修改 `runtime/lib/handoff.mjs:74` 使上述测试通过。

**Acceptance**

- [ ] 报错消息包含 `legal behaviors:` 后缀
- [ ] 列表中的每个 behavior 都是 `behavior-checks.json` 的合法 key
- [ ] 全量 smoke suite 0 失败
