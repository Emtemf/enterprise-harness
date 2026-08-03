# Design

## 修改方案

`runtime/lib/handoff.mjs:74`，throw 时附带合法 behavior 列表：

```js
// 当前
if (!contract) throw new Error(`unknown governed behavior: ${behavior}`);

// 改为
if (!contract) {
  const legal = Object.keys(registry.behaviors || {}).join(', ');
  throw new Error(`unknown governed behavior: ${behavior}; legal behaviors: ${legal}`);
}
```

- `registry` 已在 line 72 加载（`loadBehaviorRegistry(root)`），零额外 I/O
- 不改 `runtime/handoff.mjs` 的 CLI 包装层
- 不扩展 `formatDiagnostic`
- 不改 API 签名

## 测试策略

- RED：用不合法 behavior（如 `exploration`）调用 `createHandoffInput`，断言错误消息包含 `legal behaviors:` 和已知合法 behavior 名
- GREEN：修改 throw 文案使测试通过
- REFACTOR：确认零回归
