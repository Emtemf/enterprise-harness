# Review verdict

- `pass`：当前 frozen artifact、selected rubrics 与 digest 都支持放行。
- `block`：发现可修复的不满足项，必须写 correction。
- `unsupported`：输入或 checker 能力无法支持结论，必须写 correction。

runtime 只接受 schema-valid、independent、fresh 的 `pass` 作为 transition evidence。
