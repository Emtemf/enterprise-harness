# StageResult 合同

executor 完成非代码 stage 后返回 Handoff v2 common-dir 的 `result.json`，其内容必须符合 `harness/schemas/stage-result.schema.json`。它绑定 change、stage、runId、producer、input digest、artifact digest、assertions 与 TECPC。

`pass` 只表示 assertions 都通过，绝不表示 self-approval。业务决定缺失时状态为 `needs_decision`，由主 Harness 处理。
