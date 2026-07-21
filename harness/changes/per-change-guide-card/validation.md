# Validation

## Source Digest

- Validation scope: per-change-guide-card — GUIDE.md 自动生成机制 + 软门禁提醒
- 包含：模板、scaffold 自动生成、guideReminder 独立字段、SessionStart 提醒、规则文件
- 不包含：Stop hook 覆盖（本轮非目标）、字段级"未填"检测（留待后续反馈）

## Artifact Digest

- requirements: `harness/changes/per-change-guide-card/requirements.md`
- change: `harness/changes/per-change-guide-card/change.md`
- design: `harness/changes/per-change-guide-card/design.md`
- tasks: `harness/changes/per-change-guide-card/tasks.md`
- reviews:
  - `reviews/design-reviewer.json`（pass，2026-07-21）
  - `reviews/plan-critic.json`（pass，第三轮复审，2026-07-21）
- new artifacts:
  - `harness/templates/guide.md`（模板，含 6 个占位符 + 4 条验收命令路径）
  - `.claude/rules/45-guide-card.md`（durable 规则，对齐 rule=yes）
- new tests:
  - `harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs`（GUIDE 生成契约）
  - `harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs`（软门禁提醒契约）

## Commands Executed

1. `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs red`
   - Result: passed（RED 成立，GUIDE 未生成时断言失败）

2. `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs green`
   - Result: passed

3. `node harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs verify`
   - Result: passed

4. `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs red`
   - Result: passed（RED 成立，guideReminder 不存在时断言失败）

5. `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs green`
   - Result: passed

6. `node harness/plugin/runtime/test/guide-reminder-contract-smoke.mjs verify`
   - Result: passed

7. `node harness/plugin/runtime/cli.mjs verify`
   - Result: OK contract checks passed.

8. `node harness/plugin/runtime/cli.mjs doctor`
   - Result: 16 OK

9. `test -f .claude/rules/45-guide-card.md`
   - Result: exit code 0

10. 全量现有 smoke（verify 模式）
    - Command: `for f in harness/plugin/runtime/test/*smoke*.mjs; do node "$f" verify; done`
    - Result: PASS=51 FAIL=0（含 2 个新增 smoke）

11. `git status --short`
    - Result: 真实 `harness/changes/` 未被测试污染

## Verification Evidence

### GUIDE 生成契约（F1）
- RED 证据：`scaffold-guide-contract-smoke.mjs red` → 失败（GUIDE.md 不存在）
- GREEN 证据：`scaffold-guide-contract-smoke.mjs green` → 通过
  - GUIDE.md 存在
  - 无 `{{` 占位符残留
  - change-id/tier/impact 实际值写入
  - 4 条验收命令路径存在

### 软门禁提醒契约（F1 + F3）
- RED 证据：`guide-reminder-contract-smoke.mjs red` → 失败（guideReminder 不存在）
- GREEN 证据：`guide-reminder-contract-smoke.mjs green` → 通过
  - 缺 GUIDE → `guideReminder` 非 null
  - 有 GUIDE → `guideReminder` 为 null
  - SessionStart 输出含 GUIDE 提醒
  - `currentGap` 逐字不变（回归保护成立）

### currentGap 回归保护（F1）
- 断言：`currentGap === '缺少 design.md。'`
- 结果：在 GUIDE 缺失和存在两种场景下，currentGap 文案均未改变
- 影响：4 处精确等值消费（session-start hook、inferPendingDecision、3 个 smoke）零影响

### durable 规则（F2）
- `.claude/rules/45-guide-card.md` 存在
- 规则表述与 4 个 clarify 决策一致

### 回归验证
- 全量 51 个 smoke（verify 模式）全绿
- `cli verify` 通过
- `git status` 确认真实 `harness/changes/` 未被测试污染

## Skipped Checks

1. **Stop hook 覆盖**
   - 原因：design 显式声明本轮不覆盖
   - 恢复条件：后续 change 让 `hooks/stop.mjs` 消费 `guideReminder`

2. **字段级"未填"检测**
   - 原因：本轮只检测 GUIDE.md 文件是否存在，不检测字段是否留空
   - 恢复条件：后续按使用反馈决定是否需要字段级校验

3. **`requiredPaths()` 更新**
   - 原因：当前 `verify` 不检查 `45-guide-card.md` 是否存在
   - 恢复条件：后续可将 `.claude/rules/45-guide-card.md` 加入 `requiredPaths()` 的 files 列表

## Review Verdicts

| Reviewer | Verdict | Reviewed At | Notes |
|----------|---------|-------------|-------|
| design-reviewer | pass | 2026-07-21 | F1/F2/F3 三点整改通过 |
| plan-critic | pass | 2026-07-21 | 第三轮复审通过 |

## Final Verdict

验证证据 fresh，所有 RED/GREEN 证据齐全，51 个 smoke 全绿，currentGap 回归保护成立。
可以进入 VALIDATED。
