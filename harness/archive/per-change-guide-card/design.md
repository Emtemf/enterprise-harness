# Design

## Role Ownership
- 主导角色：Principal Architect 视角
- 参与角色：Fullstack Developer / Quality Engineer / Human User（范围已确认）
- 本阶段交接物：提供给开发与测试消费的 `design.md`

## Current-State Evidence

- `lifecycle.mjs cmdScaffold(changeId, owner, tier)`：新建 change 时 copy 3 个模板文件
  （`change.md` / `validation.md` / `evidence/tooling.md`），全部为**纯 `fs.copyFileSync`，无字符串替换**。
- `state.json` 是唯一有字段赋值先例：读 JSON 后 `data.changeId/owner/tier = ...` 再写回。
- `start-change.mjs`：依次 `scaffold → exploration → active`，不做内容填充。
- 软门禁接入点已定位：`lib/status-summary.mjs` 渲染"当前缺口"，其文案来自
  `lib/workflow.mjs inferCurrentGap(root, changeId, data, workflowStage)`。
- `inferCurrentGap` 已是纯函数式的缺口判定，按 stage 返回一句话；SessionStart/status 消费其结果。

## Scope / Non-goals

- 范围：
  - 新增 `harness/templates/guide.md`；
  - 改 `cmdScaffold` 生成 GUIDE.md 且回填机械字段；
  - 在 guidance surface 用**独立字段**承载一条**非阻断** GUIDE 缺失提醒（不污染 `currentGap`，见 F1 修订）；
  - 新增 durable 规则条目到 `.claude/rules/`，把"每个 change 应有 GUIDE 导航卡"固化为规则（见 F2 修订，对齐 rule=yes）。
- 非目标：不回填现有 change；不做硬门禁；不引入通用模板引擎；不改既有 artifact 职责；
  本轮**不覆盖 Stop 表面**的 GUIDE 提醒（见 F3 修订）。

## Review Findings 整改（design-reviewer 2026-07-21 block → 已修订）

- **F1（block）**：原设计把提醒"追加到 `inferCurrentGap` 返回的 `currentGap` 字符串"。经核验，
  `currentGap` 被多处**精确等值消费**：`hooks/session-start.mjs:25`、`lib/workflow.mjs inferPendingDecision`、
  以及 `clarify-gate-routing-smoke`/`snapshot-active-change-sync-smoke`/`workflow-execution-status-smoke`/
  `workflow-progression-decision-smoke` 的 `=== '…'` 断言。追加提醒会打破这些断言 → 违反验收标准 5。
  **修订**：提醒改由**独立字段** `guideReminder` 承载，`currentGap` 语义与文案完全不变。
- **F2（block-contributing）**：rule=yes 但原 scope 无规则载体。**修订**：新增规则条目到
  `.claude/rules/`（见 Interface Contract 的 rule artifact 段），使 durable 规则有明确落点。
- **F3（advisory）**：`hooks/stop.mjs` 只用 `inferWorkflowStage`，不消费 `currentGap`/summary，
  故仅改 guidance 无法让 Stop 出现提醒。**修订**：显式声明 Stop **不在本轮范围**；
  验收标准 3 用"或"逻辑，由 SessionStart + `/harness` 覆盖即达标。

## Options Considered

1. **模板 + 最小占位符替换（选中）**：guide.md 用 `{{CHANGE_ID}}` 等占位符，cmdScaffold 生成时
   `String.replaceAll` 填入已知机械字段。
2. 纯 copy 空模板：与现状一致，但机械字段仍要人/模型填，违背"给弱模型兜底"。
3. 通用模板引擎（如 handlebars）：能力过剩，引入依赖，违背非目标。

## Selected Option and Rationale

选 1。理由：
- 满足"机械字段自动填"（弱模型不该瞎编 change-id / 验收命令）。
- 占位符替换用原生 `String.prototype.replaceAll`，零依赖，是 scaffold 的**最小增量**。
- 与 state.json 已有的"读后赋值"先例风格一致，不破坏 scaffold 的模板 + copy 主范式。

## Rejected Options

- 选 2：把机械信息留给弱模型填，正是要消除的失败模式。
- 选 3：为一处小需求引入模板引擎依赖，超范围、增加插件分发体积与风险。

## Affected Layers

不涉及 Java 四层。受影响的是 harness runtime 层：
- `harness/templates/guide.md`（新增）
- `harness/plugin/runtime/lifecycle.mjs`（`cmdScaffold` 扩展）
- `harness/plugin/runtime/lib/workflow.mjs`（新增 `guideReminder` 计算，**不改** `inferCurrentGap`）
- `harness/plugin/runtime/lib/status-summary.mjs`（在 summary 与渲染中带出 `guideReminder`）
- `.claude/rules/`（新增"每个 change 应有 GUIDE 导航卡"规则条目，对齐 rule=yes）
- `harness/plugin/runtime/test/scaffold-guide-contract-smoke.mjs`（新增 smoke）

## Interface Contract
- External API: N/A（无对外 HTTP API，api=no）
- Internal service contract:
  - `cmdScaffold` 行为扩展：文件列表新增 `['guide.md', 'GUIDE.md']`；GUIDE.md 落盘前对模板文本做占位符替换。
  - 占位符集合（最小）：`{{CHANGE_ID}}`、`{{TIER}}`、`{{IMPACT_API}}`、`{{IMPACT_DATA}}`、
    `{{IMPACT_ARCHITECTURE}}`、`{{IMPACT_RULE}}`。impact 在 scaffold 时可能尚未设置，
    取 state.json 现值；按当前模板真实默认值，初始应为 `unknown`，后续可由 `impact` 命令覆盖。
  - 幂等：与现有一致——GUIDE.md 已存在则不覆盖（`if (!fs.existsSync(target))`）。
- Compatibility / caller impact:
  - `start-change` 调用方无需改动，自动获得 GUIDE.md。
  - 现有 change 不受影响（不回填）；现有 scaffold 的 3 文件行为不变。
- Rule artifact（F2 修订，对齐 rule=yes）：
  - 在 `.claude/rules/` 新增一条规则（拟名 `.claude/rules/45-guide-card.md`），内容固化：
    "每个 change 应有 GUIDE.md 导航卡；机械字段由 scaffold 自动生成；缺失时软提醒不阻断；
    仅对新建 change 生效"。这是本 change 的 durable 规则载体，使 rule=yes 有明确落点。
- Soft-gate 提醒字段（F1 修订）：
  - `lib/workflow.mjs` 新增纯函数 `computeGuideReminder(root, changeId)`：GUIDE.md 存在返回 `null`，
    缺失返回一句提醒串（如 `提醒：该 change 尚无 GUIDE.md 导航卡（不阻断）。`）。
  - `lib/status-summary.mjs` 的 `activeChangeSummary` 增加 `guideReminder` 字段，
    `renderStatusSummary` 仅在其非 null 时多渲染一行；**`currentGap` 完全不动**。
  - 保证：所有对 `currentGap` 的精确等值消费（session-start hook、inferPendingDecision、4 个 smoke）零影响。

## Data / SQL Design
- N/A（data=no，无持久化/schema/迁移）。

## Messaging / Event / MQ Design
- N/A（无消息/事件）。

## Architecture Boundary
- Layer ownership: 改动限定在 harness runtime（lifecycle + lib），不越界到 reference-service Java 层。
- Object / mapper responsibility: N/A。
- Error handling boundary: 占位符替换是纯字符串操作，无外部输入；模板文件缺失时
  `copyFileSync` 会抛错——与现有 3 模板同样假设"模板必然存在"，不额外加防御。

## Flow / State Changes

无 workflow 状态机变化。GUIDE 缺失提醒是**只读旁路且独立于 `currentGap`**：
新增纯函数 `computeGuideReminder` 只读文件是否存在，结果放进 summary 的独立字段 `guideReminder`，
渲染时仅多一行。不改变 stage 判定、不改变任何 gate、不阻断推进、**不改动 `currentGap` 文案与语义**。

## Cross-layer Type and Mapper Matrix
- N/A。

## Repository Port Design
- N/A。

## API Contract
- N/A（api=no）。

## Error Handling
- 占位符替换无外部/用户输入，不需要输入校验（内部可信数据：state.json 字段）。
- 模板读取沿用现有 `copyFileSync` 假设；但因需先替换再写，改为 `readFileSync → replaceAll → writeFileSync`。

## Transaction Boundaries
- N/A。

## Testing Strategy
- Unit / contract：采用**两个**三态 smoke，边界明确、避免跨 task 互相污染：
  1. `scaffold-guide-contract-smoke.mjs`
     - 只覆盖 GUIDE 模板与 scaffold 生成契约：
       (a) GUIDE.md 存在；
       (b) `{{CHANGE_ID}}` 等占位符已被替换（无残留 `{{`）；
       (c) change-id / tier / impact 实际值出现在 GUIDE.md 中；
       (d) GUIDE.md 中存在可直接执行的验收命令区块与命令路径（`verify` / `doctor` / 关键 smoke / `show-active`）。
  2. `guide-reminder-contract-smoke.mjs`
     - 只覆盖软门禁提醒契约：
       (a) 无 GUIDE.md 时 `computeGuideReminder` 返回非 null；
       (b) 有 GUIDE.md 时返回 null；
       (c) SessionStart 输出在缺失场景含 GUIDE 提醒；
       (d) `currentGap` 与既有文案**逐字不变**（回归保护，直接针对 F1）。
- 两个 smoke 都采用现有 `red|green|verify` 三态；且都须在**临时目录**中执行，绝不写真实 `harness/changes/`（规避已知 smoke 污染坑）。
- 回归保护（F1）：本 change 不得改动任何现有 smoke 对 `currentGap` 的精确断言；verify 阶段须重跑全部现有 smoke 确认零退化。
- Integration: N/A。
- Backend API E2E: N/A（无 HTTP 端点）。
- RED path：先写 `scaffold-guide-contract-smoke.mjs` 并观察 RED，再做 GUIDE 生成实现；再写 `guide-reminder-contract-smoke.mjs` 观察 RED，再做软提醒实现。

## Rollout and Rollback

- Rollout: 纯本地 runtime 行为 + 新模板文件，随下次发布生效。
- Rollback: 三处改动均可独立 `git revert`；GUIDE.md 是新增文件，回滚不影响既有 change 资产。

## Risks

- 占位符残留（替换遗漏某字段）→ 由 smoke 的"无 `{{` 残留"断言兜住。
- 未来新增机械字段时占位符集合漂移 → 在 guide.md 模板与替换 map 集中维护，二者须同步（design 已列全集合）。
- 软门禁提醒措辞若太吵 → 设计为单行追加、仅在缺失时出现，不重复刷屏。

## Open Questions

- 软门禁"关键字段未填"的判定：本轮**只检测 GUIDE.md 文件是否存在**（最简、够用），
  不检测字段是否留空。字段级校验留待后续按使用反馈再定，避免过度设计。
- Stop 表面提醒：本轮不覆盖（F3）；若未来要覆盖，需让 `hooks/stop.mjs` 消费 summary/guideReminder，属后续 change。

## Design Self-Review

- 覆盖接口：cmdScaffold 契约、占位符集合、幂等、兼容性、rule artifact、guideReminder 字段 ✅
- 覆盖数据/SQL：N/A 已说明 ✅
- 覆盖架构边界：限定 runtime 层，不越界；F1 的 runtime 内部跨消费方影响已分析并用独立字段规避 ✅
- 覆盖测试策略：三态 smoke + 临时目录 + guideReminder 断言 + currentGap 逐字不变回归保护 + RED path ✅
- 覆盖回滚：四处（模板/scaffold/workflow+summary/rule）可独立 revert ✅
- 符合非目标：无回填、无硬门禁、无模板引擎、不覆盖 Stop ✅
- reviewer block 三点（F1/F2/F3）均已整改并核验代码事实 ✅

## Approval

- 待 design-reviewer 复审出具非 block verdict 后，置 `approvals.design` 与 `gates.designApproved`。
