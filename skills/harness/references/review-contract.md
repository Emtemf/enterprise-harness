# Review Contract

## Review verdict

- `pass`：当前 frozen artifact、selected rubrics 与 digest 都支持放行。
- `block`：发现可修复的不满足项，必须写 correction。
- `unsupported`：输入或 checker 能力无法支持结论，必须写 correction。

runtime 只接受 schema-valid、independent、fresh 的 `pass` 作为 transition evidence。

## ReviewResult 合同

checker 在独立 Handoff v2 check run 的 `check.json` 返回 `harness/schemas/review-result.schema.json` 所定义的结果。它必须绑定 parent executor run、被审 artifact digest、机械选择的 rubric 和 TECPC。

只有 `pass` 可令 `correction: null`；`block` 和 `unsupported` 都必须提供可执行 correction。checker 不得读取 executor transcript。
