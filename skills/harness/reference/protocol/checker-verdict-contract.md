# ReviewResult 合同

checker 在独立 Handoff v2 check run 的 `check.json` 返回 `harness/schemas/review-result.schema.json` 所定义的结果。它必须绑定 parent executor run、被审 artifact digest、机械选择的 rubric 和 TECPC。

只有 `pass` 可令 `correction: null`；`block` 和 `unsupported` 都必须提供可执行 correction。checker 不得读取 executor transcript。
