# Verify 标准样例

## 有效

`TC1` 映射 `task-api`，该 task 的末相命令冻结为 `["npm","test","--","api.e2e.test.ts"]`。
Verify worker 运行 `verify-run change-1 run_<uuid> TC1`，runtime evidence 记录相同 argv、exit 0、时间与
stdout/stderr digest；validation 覆盖行引用 `evidence/verify/run_<uuid>/TC1.json`。

## 无效

- worker 直接运行 `npm test`，再手写“exit 0”：绕过 runner。
- coverage 行引用 Implement task receipt：没有证明最终环境中的 fresh rerun。
- 为了方便把冻结 Playwright 命令改成单测：argv 漂移且丢失 E2E。
- critical E2E 写成 skipped，仍给 executor verdict pass：违反 fail-closed。
