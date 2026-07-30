# Testing and Review

- 先写能证明缺陷的测试，再实现最小修复。
- Java/Maven 必须实际执行冻结的 `./mvnw` 或 `mvn` argv。
- RED 是目标断言失败，不能用无条件退出伪造。
- receipt 记录 exact argv、exit、时间、agent、worktree 和 digest。
- executor 不得自审。
- checker 必须独立 run，并返回 pass、block 或 advisory。
- OpenAPI、Controller、request、response 和 error contract 分开验证。
- 受治理写入后 validation 变 stale。
- 只有 fresh validation 和 completion predicate pass 才能声称完成。

长期合同见 `harness/specs/evidence.md`、`harness/specs/testing.md` 和 `harness/specs/verify-contract.md`。
