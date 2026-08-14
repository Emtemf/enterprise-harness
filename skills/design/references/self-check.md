# Design 自检

提交 `StageResult` 前执行：

1. `scripts/prepare-input.mjs` 的 input digest 仍对应当前 requirements。
2. `assert/artifact-shape.mjs`、`assert/requirement-coverage.mjs`、`assert/traceability.mjs` 都返回 `pass`。
3. 所有不适用的影响面说明 `N/A` 及理由；适用面包含可执行验证与回滚。
4. 没有未决业务选择；若存在，返回 `NEEDS_DECISION` 与一个可回答的决定，而不是伪造通过。

自检不是 approval；独立 reviewer 仍必须依据 rubric 产生单独的 `ReviewResult`。
