# Tasks

## Task 1: renderG4CCard 纯函数
- Touched files: `harness/plugin/runtime/lib/g4c-card.mjs`（新增）
- RED point: `g4c-card-smoke.mjs` 断言函数存在且输出含阶梯三态
- GREEN point: 函数实现，所有 smoke 断言通过
- Acceptance: 多个 fixture state 输出正确的 ✓/▸/○ 阶梯与降级文案

## Task 2: state schema 向后兼容
- Touched files: `harness/plugin/runtime/lib/state-migration.mjs`
- RED point: `state-migration-backward-compat-smoke.mjs` 追加场景——旧 state 缺 goal/successCriteria/routingReason 自动补齐
- GREEN point: migration 逻辑补齐默认值
- Acceptance: 旧 state.json 读入后自动含 goal:null/successCriteria:[]/routingReason:null

## Task 3: 三处回显 G4C 卡
- Touched files: `cli.mjs status`（`status-summary.mjs`）、`session-start.mjs`、`pre-write.mjs`
- RED point: `g4c-card-integration-smoke.mjs` 断言 status 命令输出含 G4C 卡标记
- GREEN point: 三处 import renderG4CCard 并在合适位置输出
- Acceptance: `cli.mjs status` 输出含阶梯标记；BLOCK 时 stderr 含 G4C 卡；session-start 输出含卡片

## Task 4: 文档 + 版本
- Touched files: CHANGELOG.md、PROGRESS.md、package.json、manifest.json、plugin.json
- Acceptance: `cli.mjs verify` 全绿

## Task 5: 归档
- Acceptance: g4c-progress-card state=VALIDATED，lifecycle archive 成功
