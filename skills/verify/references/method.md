# Verify 方法

1. 以 accepted `TC*` 为工作队列，不以文件类型或工具偏好为工作队列。
2. 对每个 TC 使用其 Plan 映射 task 的末相冻结命令；一个 TC 映射多个 task 时全部执行并保留顺序。
3. `verify-run` 是唯一命令执行入口。它使用 argv 数组和 `shell: false`，并为每条命令记录 outcome、
   exit code、时间、stdout/stderr 文件及 digest。
4. 验证通过要求全部映射命令真实以 exit code 0 完成。spawn error、signal、非零退出、stale input、
   argv 漂移或缺失 agent binding 都是 block。
5. E2E 的价值在于用户流程与可观察断言；浏览器、CLI、HTTP 或消息链只是实现手段。Plan 冻结什么，
   Verify 就机械执行什么，不在 Verify 阶段重新选择 Playwright、Chrome DevTools 或 MCP。
6. `validation.md` 是人类报告；机器真相是 command evidence、逐 TC verification receipt 和 StageResult。
