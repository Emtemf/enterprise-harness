# Archive method

在归档前读取。Archive 是完成证据的不可变封存和恢复入口，不是清理 active 目录的文件操作。

## Workflow

1. 区分 `complete` 与 `abandon`；未满足完成 predicate 时不得归档。
2. 重新验证 Verify CompletionProof、ReviewResult、input/artifact digests 与 lifecycle CAS。
3. 检查 future-reader packet：为什么改、决定了什么、如何验证、如何回滚或 supersede。
4. 运行唯一 archive-finalize command，保留 provenance 并拒绝覆盖目标。
5. 从归档路径重新读取关键索引，确认无需聊天或临时 worktree 即可审计。

## Decision lenses

- **Completeness**：required evidence 是否闭合，还是只剩“看起来完成”。
- **Provenance**：artifact、builder/runtime、inputs、review 和 digest 是否可关联。
- **Recoverability**：失败、回滚、abandon 与 superseding change 是否可追踪。
- **Immutability**：归档后不修补历史；新事实通过新 change/decision 追加。
- **Minimum retention**：保留调试、审计、重建所需证据，不打包临时 spool、secret 或噪音。

## Failure modes

- 为清空 active change 把 stale/unsupported/waived 工作标成 archived。
- 移动文件后才发现 review、digest 或 consumer reference 不完整。
- 把临时 runner 输出当长期 provenance，或遗漏生成者和输入。
- 修改历史归档来“修正”旧决定，而不是创建 superseding record。
- 完成与 abandon 共用模糊状态，未来无法知道是否交付。

## Sources

- [SLSA Build Provenance](https://slsa.dev/spec/v1.2-rc2/build-provenance)
- [SLSA: Verifying artifacts](https://slsa.dev/spec/v1.2/verifying-artifacts)
- [Martin Fowler: Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)
