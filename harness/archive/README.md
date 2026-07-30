# Archive

本目录保存已完成 change 的历史证据，不参与当前 runtime 判定，也不进入发布包。

- 动态真相只读取 `harness/ACTIVE_CHANGE` 与 `harness/changes/<change-id>/state.json`。
- 文档、skills 与 specs 不逐项链接历史 change。
- `index.json` 由 `node bin/generate-archive-index.mjs` 机械生成，用于检索而不是恢复状态。
- 可公开示例应复制并脱敏到 `examples/accepted-change/`，不要直接把整个 archive 安装给用户。
