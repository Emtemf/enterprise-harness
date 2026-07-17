# 2026-07-15 交接文档：`session-lifecycle-progress` 已完成，下一步切回 `gate-hardening-semantics`

> 用途：给**新 session** 一个可直接消费的、足够详细的 handoff 文档，让它不用重新考古就能继续后续主线。
>
> 结论先行：
> - `session-lifecycle-progress` 已完成并进入 `VALIDATED`
> - 现在最自然的下一步是切回 issue #11 对应的 `gate-hardening-semantics`
> - **注意：当前 `harness/ACTIVE_CHANGE` 仍指向 `session-lifecycle-progress`，新 session 开始真正实现下一条主线前，应先切换 active change**

---

## 1. 背景和决策过程（为什么这么做）

### 1.1 原始问题
用户希望 Enterprise Harness 在**新会话打开时**，能更快回答这五个问题：

1. 这是什么系统
2. 怎么组织的
3. 怎么跑
4. 怎么验证
5. 现在做到哪里了

同时，用户希望**结束会话时**，不要把可恢复结论只留在聊天记录里，而是明确告诉人：

- change-specific 结论写到哪里
- repo-level 进度写到哪里
- Claude memory 什么时候才该写
- 聊天记录为什么不能替代正式资产

### 1.2 为什么这是 L3，而不是普通文档优化
这次改动不是单纯加文档，而是同时触达：

- repo-facing docs
- stable spec
- runtime CLI
- SessionStart hook
- Stop hook
- doctor / verify / full-verify contract
- smoke/TDD harness

所以最终被路由成 **L3 平台规则 / 架构语义收紧**，而不是 L1/L2 文档增强。

### 1.3 为什么选择“静态 `PROGRESS.md` + 动态 `status` + hook 摘要”
设计上考虑过三条路：

- 只加静态 `PROGRESS.md`
- 只加动态 `status` 命令
- 静态快照 + 动态命令 + SessionStart/Stop 摘要

最后选第三条，原因是：

- 只做静态文档会过期，不能回答 active change / validation freshness
- 只做动态命令又缺一个 repo-facing 前门，不符合用户预期
- 双层模型可以明确区分：
  - **静态阶段快照**：`PROGRESS.md`
  - **动态真相**：`harness/ACTIVE_CHANGE` + `harness/changes/*/state.json`

### 1.4 为什么 Stop 只做 guidance，不自动写 memory
这是本轮最关键的边界之一：

- Stop 只能提醒“该写到哪里”
- **不能伪造**“已经帮你写入 Claude memory”
- Claude memory 只允许保存 repo 没有记录、但跨会话有价值的**非仓库事实**，且必须通过**显式动作**触发

这条边界已经固化到：

- `harness/specs/session-lifecycle.md`
- `harness/plugin/runtime/hooks/stop.mjs`
- `README.md`
- `validation.md`

### 1.5 为什么下一步切回 `gate-hardening-semantics`
`session-lifecycle-progress` 的目标是先把：

- 新会话启动可恢复性
- 结束会话 handoff 边界
- progress/status surface

做成一个**已验证基线**。

这条基线现在已经完成，所以下一条最合理的主线就是回到 issue #11：

- design gate
- task gate
- reviewer verdict consumption
- validation freshness mechanical consumption

也就是：`harness/changes/gate-hardening-semantics/`。

---

## 2. 完整的改动内容（每个文件具体改什么，精确到代码片段）

下面按“运行时 / hook / 校验 / 文档 / 测试 / change 资产”分组。

---

### 2.1 新增 repo-facing progress surface：`PROGRESS.md`

**文件**：`/home/wula/IdeaProjects/sdd/PROGRESS.md`

**作用**：提供 repo-facing 静态进度快照，不替代动态真相。

**关键内容**：

```md
## 当前阶段

- 当前阶段：session lifecycle / progress surface 已完成最小闭环并通过验证（L3 session-lifecycle-progress）
- 进度定位：repo contract + portable runtime MVP 已成形；新会话全局状态加载与结束会话 handoff 落点现在已有可验证基线

## 当前 active change

- 当前 active change：`session-lifecycle-progress`（当前已到 `VALIDATED`）
- 当前目标：把下一步重心切回 task gate、RED_VERIFIED 消费与更强验证门禁

## 下一步重点

- 把下一步优先级切回 task gate、RED_VERIFIED 消费与更强验证门禁
- 继续把 Stop / status / SessionStart 的最小闭环扩展为更强的机械 gate
- 持续保持 Stop 只做 handoff guidance，不冒充自动 memory write
```

**说明**：
- `PROGRESS.md` 是**静态入口**
- 新 session 应先读它，但它**不是动态真相**

---

### 2.2 新增稳定 spec：`harness/specs/session-lifecycle.md`

**文件**：`/home/wula/IdeaProjects/sdd/harness/specs/session-lifecycle.md`

**作用**：把会话打开/结束、动态真相、handoff routing、status contract 固化为长期规范。

**关键片段**：

```md
## 三层真相边界

### 1. 当前动态状态真相
- `harness/ACTIVE_CHANGE`
- `harness/changes/*/state.json`

### 2. 阶段快照与阅读入口
- `PROGRESS.md`

### 3. 长效规则与操作合同
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `harness/specs/`
```

```md
### Stop
Stop 继续承担 validation freshness / completion protection，同时补充 durable handoff guidance。

Stop 的 guidance 至少应覆盖：

- change-specific 结论优先写回当前 active change 资产
- repo-level 阶段信息写回 `PROGRESS.md`
- Claude memory 只记录 repo 中没有落盘、且通过显式动作触发的非仓库事实
- 聊天记录可以作为来源，但不能替代上述正式资产
- 如需重新确认当前状态，可运行 `node harness/plugin/runtime/cli.mjs status`
```

**说明**：
- 这是新 session 判断“会话打开/结束应该怎么做”的**长期真相**
- 比 `README.md` 更规范化，比聊天记录更可靠

---

### 2.3 新增 top-level runtime 命令：`status`

#### 2.3.1 `harness/plugin/runtime/status.mjs`

**文件**：`/home/wula/IdeaProjects/sdd/harness/plugin/runtime/status.mjs`

**关键代码**：

```javascript
import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { buildStatusSummary, renderStatusSummary } from './lib/status-summary.mjs';

const root = projectRoot();
const summary = buildStatusSummary(root);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(0);
}

console.log(renderStatusSummary(summary));
```

**作用**：
- `status` 的人类可读输出
- `status --json` 的稳定契约输出

#### 2.3.2 `harness/plugin/runtime/lib/status-summary.mjs`

**文件**：`/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`

**关键代码**：

```javascript
function parseProgressSnapshot(text) {
  const currentPhase = text.match(/^- 当前阶段：(.+)$/m)?.[1]?.trim() || '未记录';
  const currentGoal = text.match(/^- 当前目标：(.+)$/m)?.[1]?.trim() || null;
  const nextFocus = Array.from(text.matchAll(/^- (.+)$/gm))
    .map((m) => m[1].trim())
    .filter((line) => !line.startsWith('当前阶段：') && !line.startsWith('进度定位：') && !line.startsWith('当前 active change：') && !line.startsWith('当前目标：') && !line.startsWith('动态真相优先级：') && !line.startsWith('本文件用途：'));
  return {
    file: 'PROGRESS.md',
    currentPhase,
    currentGoal,
    highlights: nextFocus.slice(0, 5),
  };
}
```

```javascript
export function buildStatusSummary(root) {
  const progressPath = path.join(root, 'PROGRESS.md');
  const progressText = readText(progressPath);
  const progressSnapshot = parseProgressSnapshot(progressText);
  const activeChange = activeChangeSummary(root);
  return {
    summaryVersion: 1,
    currentPhase: progressSnapshot.currentPhase,
    progressSnapshot,
    activeChange,
    truthSources: [
      {
        kind: 'dynamic',
        paths: ['harness/ACTIVE_CHANGE', 'harness/changes/*/state.json'],
        note: '当前动态状态以 active change 与 state.json 为准',
      },
      {
        kind: 'static',
        paths: ['PROGRESS.md'],
        note: 'PROGRESS.md 只承载阶段快照与阅读入口',
      },
    ],
    nextRead: [
      'README.md',
      'AGENTS.md',
      'CLAUDE.md',
      'PROGRESS.md',
      'harness/specs/session-lifecycle.md',
    ],
    nextCommands: [
      'node harness/plugin/runtime/cli.mjs status',
      'node harness/plugin/runtime/cli.mjs doctor',
      'node harness/plugin/runtime/cli.mjs verify',
    ],
  };
}
```

```javascript
export function renderStatusSummary(summary) {
  const active = summary.activeChange.present
    ? `${summary.activeChange.changeId} | state=${summary.activeChange.state} | validation=${summary.activeChange.validationStatus}`
    : '当前没有 active change';
  return [
    'Enterprise Harness Status',
    '当前阶段',
    `- ${summary.currentPhase}`,
    '静态快照',
    `- ${summary.progressSnapshot.file}`,
    summary.progressSnapshot.currentGoal ? `- 当前目标：${summary.progressSnapshot.currentGoal}` : '- 当前目标：未记录',
    '动态真相',
    `- ${active}`,
    '下一步阅读',
    ...summary.nextRead.map((item) => `- ${item}`),
    '下一步命令',
    ...summary.nextCommands.map((item) => `- ${item}`),
  ].join('\n');
}
```

**作用**：
- 统一 `status` 与 SessionStart 的摘要来源
- 规定 `summaryVersion/currentPhase/progressSnapshot/activeChange/truthSources/nextRead/nextCommands` 这组稳定字段

**注意**：
- `parseProgressSnapshot()` 是基于 `PROGRESS.md` 当前 bullet 结构做 regex 抽取的
- 所以后续若改 `PROGRESS.md` 的格式，必须同步检查这里

#### 2.3.3 `harness/plugin/runtime/cli.mjs`

**文件**：`/home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs`

**新增代码**：

```javascript
const commands = {
  bootstrap: ['harness/plugin/runtime/bootstrap.mjs'],
  doctor: ['harness/plugin/runtime/doctor.mjs'],
  sync: ['harness/plugin/runtime/sync.mjs'],
  install: ['harness/plugin/runtime/install.mjs'],
  verify: ['harness/plugin/runtime/verify.mjs'],
  'setup-local-adapter': ['harness/plugin/runtime/setup-local-adapter.mjs'],
  'start-change': ['harness/plugin/runtime/start-change.mjs'],
  'release-local': ['harness/plugin/runtime/release-local.mjs'],
  status: ['harness/plugin/runtime/status.mjs'],
  update: ['harness/plugin/runtime/update.mjs'],
  upgrade: ['harness/plugin/runtime/upgrade.mjs'],
  migrate: ['harness/plugin/runtime/migrate.mjs'],
  'upstream-check': ['harness/plugin/runtime/upstream-check.mjs'],
  lifecycle: ['harness/plugin/runtime/lifecycle.mjs'],
  context7: ['harness/plugin/runtime/context7.mjs'],
};
```

**说明**：
- `status` 是新的 **top-level** CLI 子命令
- 刻意没有塞回 `lifecycle.mjs`

#### 2.3.4 `package.json`

**文件**：`/home/wula/IdeaProjects/sdd/package.json`

**新增 script**：

```json
"status": "node harness/plugin/runtime/cli.mjs status"
```

#### 2.3.5 `harness/plugin/manifest.json`

**文件**：`/home/wula/IdeaProjects/sdd/harness/plugin/manifest.json`

**新增 command**：

```json
"status": "node harness/plugin/runtime/cli.mjs status"
```

---

### 2.4 强化 SessionStart：`harness/plugin/runtime/hooks/session-start.mjs`

**文件**：`/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/session-start.mjs`

**关键代码**：

```javascript
import { projectRoot, exists } from '../lib/checks.mjs';
import { buildStatusSummary } from '../lib/status-summary.mjs';

const root = projectRoot();
const parts = [
  `.claude/rules=${exists(root, '.claude/rules') ? '存在' : '缺失'}`,
  `.claude/agents=${exists(root, '.claude/agents') ? '存在' : '缺失'}`,
  `.claude/skills=${exists(root, '.claude/skills') ? '存在' : '缺失'}`,
  `templates=${exists(root, 'harness/templates') ? '存在' : '缺失'}`,
  `changes=${exists(root, 'harness/changes') ? '存在' : '缺失'}`,
  `specs=${exists(root, 'harness/specs') ? '存在' : '缺失'}`,
];
const summary = buildStatusSummary(root);
const activeChange = summary.activeChange.present
  ? `${summary.activeChange.changeId} | state=${summary.activeChange.state} | validation=${summary.activeChange.validationStatus}`
  : '当前没有 active change';
const progressFile = summary.progressSnapshot.file || 'PROGRESS.md';
const statusCommand = summary.nextCommands.find((command) => command.includes('status')) || 'node harness/plugin/runtime/cli.mjs status';
console.log(`[Harness 启动检查] ${parts.join(' | ')}`);
console.log(`[Harness 入口] Claude Code 流程入口: /harness | Runtime 命令入口: node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]`);
console.log(`[Harness 进度] 当前阶段: ${summary.currentPhase}`);
console.log(`[Harness 进度] 静态快照: ${progressFile}`);
console.log(`[Harness 进度] 动态真相: ${activeChange}`);
console.log(`[Harness 进度] 下一步命令: ${statusCommand}`);
```

**作用**：
- 新会话启动时直接给出：
  - 骨架完整性
  - 当前阶段
  - progress snapshot 指针
  - active change / validation 状态
  - `status` 命令入口

---

### 2.5 强化 Stop：`harness/plugin/runtime/hooks/stop.mjs`

**文件**：`/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/stop.mjs`

**关键代码**：

```javascript
function activeChangeGuidance(root) {
  const active = loadActiveChange(root);
  if (!active.ok) {
    return 'change-specific 结论：优先写回当前 active change 资产；若当前没有 active change，请先补足对应 change bundle。';
  }
  return `change-specific 结论：优先写回 harness/changes/${active.changeId}/ 下的 change.md / design.md / tasks.md / validation.md / evidence/*.md / reviews/*.json。`;
}

function printHandoffGuidance(root) {
  console.error('Stop handoff guidance:');
  console.error(`- ${activeChangeGuidance(root)}`);
  console.error('- repo-level 阶段信息：写回 PROGRESS.md，更新整体阶段、当前目标与下一步重点。');
  console.error('- Claude memory：只保存 repo 中没有记录、但跨会话仍有价值的非仓库事实，而且必须通过显式动作触发。');
  console.error('- 聊天记录：可以作为来源，但不是仓库真相，也不能替代 change 资产、PROGRESS.md 或 Claude memory。');
  console.error('- 如需重新确认当前状态，可运行 node harness/plugin/runtime/cli.mjs status。');
}
```

```javascript
if (!fs.existsSync(validationPath)) {
  console.error(`BLOCK: ${changeDir} 缺少 validation.md，不能作为完成状态结束。`);
  process.exit(2);
}
if ((state.state === 'VALIDATED' || state.state === 'REVIEWED') && state.validation?.status !== 'fresh') {
  console.error(`BLOCK: ${changeDir} 的 validation.status=${state.validation?.status}，请先刷新验证证据。`);
  process.exit(2);
}
```

```javascript
if (warned) {
  console.error('Stop gate 提醒：仍有 change 处于 EXECUTING，请确认是否要结束在当前中间状态。');
}
printHandoffGuidance(root);
process.exit(0);
```

**这里非常重要**：
- **保留了原有 block 语义**
- handoff guidance 只在通过 gate 后输出
- 没有把“guidance”变成“自动落盘”或“自动 memory write”

---

### 2.6 把 progress/session-lifecycle 接入 doctor / verify / shell full-verify

#### 2.6.1 `harness/plugin/runtime/doctor.mjs`

**关键代码**：

```javascript
const requiredProjectFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'PROGRESS.md',
  '.claude/settings.json',
  'harness/config.yaml',
  'harness/specs/plugin-runtime.md',
  'harness/specs/session-lifecycle.md',
];
```

#### 2.6.2 `harness/plugin/runtime/lib/checks.mjs`

**关键代码**：

```javascript
files: [
  'AGENTS.md',
  'CLAUDE.md',
  'PROGRESS.md',
  '.mcp.json',
  '.claude/settings.json',
  ...
  'harness/specs/session-lifecycle.md',
  ...
]
```

#### 2.6.3 `hooks/validate-spec-structure.sh`

**关键片段**：

```bash
required_files=(
  "$ROOT/CLAUDE.md"
  "$ROOT/PROGRESS.md"
  ...
  "$ROOT/harness/specs/session-lifecycle.md"
  ...
)
```

**作用**：
- `doctor` 会检查 `PROGRESS.md` 和 `session-lifecycle.md`
- `verify` 的 required paths 会感知它们
- `full-verify` 的 shell 结构校验也会感知它们

---

### 2.7 repo-facing docs 统一接入口径

#### 2.7.1 `README.md`

**新增 Stop/handoff 说明**：

```md
7. **完成前必须刷新验证证据**
   - Stop gate 会阻止 stale validation 或缺失 validation 资产的“伪完成”状态
   - 同时明确提示：change-specific 结论应回写 change 资产，repo-level 阶段信息应回写 `PROGRESS.md`，Claude memory 只保存显式触发的非仓库事实
```

**新增 runtime CLI `status`**：

```md
当前已具备：

- `bootstrap`
- `doctor`
- `sync`
- `verify`
- `status`
- `install`
```

**新增查看全局状态入口**：

```md
### 4. 查看当前全局状态
```bash
node harness/plugin/runtime/cli.mjs status
node harness/plugin/runtime/cli.mjs status --json
```
```

**核心 contract / spec 增加**：

```md
### 核心 contract / spec
- [`PROGRESS.md`](PROGRESS.md)
- [`CLAUDE.md`](CLAUDE.md)
- [`harness/specs/plugin-runtime.md`](harness/specs/plugin-runtime.md)
- [`harness/specs/session-lifecycle.md`](harness/specs/session-lifecycle.md)
```

#### 2.7.2 `AGENTS.md`

**阅读顺序调整**：

```md
1. `README.md`：项目定位、入口模型、Quickstart
2. `AGENTS.md`：仓库级协作合同
3. `PROGRESS.md`：当前阶段快照与继续阅读入口
4. `CLAUDE.md`：Claude Code 专用高层操作合同
5. `harness/specs/session-lifecycle.md`：会话打开/结束与 handoff 规则
```

#### 2.7.3 `CLAUDE.md`

**资产位置补充**：

```md
- 进度快照：`PROGRESS.md`
- 稳定规范：`harness/specs/`
- 活动 change：`harness/changes/`
```

#### 2.7.4 `docs/zh-cn/overview.md`

**高层入口新增**：

```md
### 高层入口
- `README.md`
- `PROGRESS.md`
- `CLAUDE.md`
```

**继续阅读新增**：

```md
- `README.md`
- `PROGRESS.md`
- `CLAUDE.md`
- `harness/specs/session-lifecycle.md`
```

#### 2.7.5 `harness/specs/directory-model.md`

**目录职责新增**：

```md
### `PROGRESS.md`
repo-facing 的阶段快照与继续阅读入口；不替代 `harness/ACTIVE_CHANGE` 与 `harness/changes/*/state.json` 的动态真相职责。
```

```md
### `harness/specs/`
长期稳定规范，例如 plugin runtime、session-lifecycle、local adapter、evidence submission、containerization/sandboxing 等长期真相。
```

---

### 2.8 新增 smoke tests / fixtures

#### 2.8.1 `harness/plugin/runtime/test/session-status-smoke.mjs`

**核心断言**：

```javascript
const jsonKeys = ['summaryVersion', 'currentPhase', 'progressSnapshot', 'activeChange', 'truthSources', 'nextRead', 'nextCommands'];
const headings = ['当前阶段', '静态快照', '动态真相', '下一步阅读', '下一步命令'];
```

```javascript
const statusResult = runCliStatus();
const statusJsonResult = runCliStatusJson();
const packageResult = runPackageStatus();
const wiring = statusWiring();
const manifestResult = runManifestStatus(wiring.manifestCommand);
const jsonContract = parseStatusJson(statusJsonResult);
```

```javascript
if (mode === 'green' || mode === 'verify') {
  if (statusResult.status !== 0) {
    fail(`Expected status command to succeed, got exit=${statusResult.status}`);
  }
  if (!hasHeadings(statusResult)) {
    fail('Expected human-readable status output to include all fixed headings');
  }
  if (!jsonContract.ok) {
    fail(`Expected status --json contract to pass, got ${jsonContract.reason}`);
  }
  if (!wiring.packageCommand || packageResult.status !== 0) {
    fail('Expected package.json status script to be wired and runnable');
  }
  if (!wiring.manifestCommand || manifestResult.status !== 0) {
    fail('Expected manifest.json status command to be wired and runnable');
  }
}
```

**意义**：
- 不只是检查文件存在
- 而是真跑 `status` / `status --json` / `npm run status` / manifest command

#### 2.8.2 `harness/plugin/runtime/test/session-start-summary-smoke.mjs`

**核心 token**：

```javascript
const requiredTokens = [
  '[Harness 启动检查]',
  '当前阶段',
  'PROGRESS.md',
  'session-lifecycle-progress',
  'node harness/plugin/runtime/cli.mjs status',
];
```

#### 2.8.3 `harness/plugin/runtime/test/session-contract-surface-smoke.mjs`

**核心 required paths**：

```javascript
const requiredRelPaths = ['PROGRESS.md', 'harness/specs/session-lifecycle.md'];
```

**核心验证面**：

```javascript
const doctor = parseDoctorChecks();
const checksText = readText(checksPath);
const shellValidateText = readText(shellValidatePath);
const docs = docsContainTargets();
```

```javascript
if (!docs.hasReadme || !docs.hasAgents || !docs.hasClaude || !docs.hasOverview || !docs.hasDirectoryModel) {
  fail('Expected repo-facing docs to reference PROGRESS.md and session-lifecycle.md entrypoints');
}
```

#### 2.8.4 `harness/plugin/runtime/test/stop-handoff-smoke.mjs`

**guidance tokens**：

```javascript
const guidanceTokens = [
  'Stop handoff guidance',
  'change-specific 结论',
  'repo-level 阶段信息',
  'PROGRESS.md',
  'Claude memory',
  '聊天记录',
];
```

**核心断言**：

```javascript
const keepsMissingValidationBlock =
  missingValidationResult.status === 2 && missingValidationOutput.includes('缺少 validation.md');
const keepsStaleValidationBlock =
  staleValidationResult.status === 2 && staleValidationOutput.includes('validation.status=stale');
```

```javascript
if (!hasGuidance) {
  fail('Expected Stop output to include handoff guidance for change assets, PROGRESS.md, Claude memory, and chat logs');
}
if (!keepsMissingValidationBlock) {
  fail('Expected Stop to keep blocking missing validation.md with exit=2');
}
if (!keepsStaleValidationBlock) {
  fail('Expected Stop to keep blocking stale validation on REVIEWED/VALIDATED changes with exit=2');
}
```

#### 2.8.5 fixtures

**`stop-handoff-missing-validation/state.json`**：

```json
{
  "changeId": "stop-handoff-missing-validation",
  "state": "REVIEWED",
  "validation": {
    "status": "fresh"
  }
}
```

**`stop-handoff-stale-validation/state.json`**：

```json
{
  "changeId": "stop-handoff-stale-validation",
  "state": "REVIEWED",
  "validation": {
    "status": "stale"
  }
}
```

**意义**：
- 用最小 fixture 证明 Stop 的 block 语义没有被 guidance 回归破坏

---

### 2.9 change 资产 / review / source-of-truth 收口

#### 2.9.1 `harness/changes/session-lifecycle-progress/state.json`

**最终状态**：

```json
{
  "state": "VALIDATED",
  "currentTask": null,
  "validation": {
    "status": "fresh",
    "digest": "session-lifecycle-progress-2026-07-15-green",
    "validatedAt": "2026-07-15"
  }
}
```

#### 2.9.2 `harness/changes/session-lifecycle-progress/validation.md`

**最终 verdict**：

```md
## Final Verdict

- Task 1 / Task 2 / Task 3 / Task 4：均已完成 RED → GREEN → verify，并补齐对应 smoke/runtime 证据。
- 当前 change 已具备 `status`、SessionStart、Stop、doctor、runtime verify、full-verify 与 repo-facing 文档入口的一致性闭环。
- `state.json` 已同步到 `VALIDATED` + `validation.status=fresh`，当前 source-of-truth 与验证证据已对齐。
- verification review 已通过；当前 change 可作为 `VALIDATED` 的 session lifecycle / progress surface 基线继续使用。
```

#### 2.9.3 review files

最终 review 闭环包括：

- `reviews/requirement-reviewer.json`
- `reviews/design-reviewer.json`
- `reviews/plan-critic.json`
- `reviews/task1-plan-critic.json`
- `reviews/task2-plan-critic.json`
- `reviews/task3-plan-critic.json`
- `reviews/task4-plan-critic.json`
- `reviews/verification-reviewer.json`

**最终 verification review 已 pass**。

---

## 3. 实施顺序和依赖关系

### 3.1 已完成 change 的真实实施顺序

这是本轮实际的依赖顺序，不建议新 session 打乱理解顺序：

1. **Task 1：progress surface / status contract**
   - 先有 `PROGRESS.md`
   - 再有 `status-summary`
   - 再有 `status` top-level CLI
   - 再接 package / manifest
   - 再补 smoke

2. **Task 2：SessionStart 摘要**
   - 依赖 Task 1 的 `buildStatusSummary()`
   - 如果没有统一 contract，SessionStart 就会重新硬编码

3. **Task 3：contract wiring + repo-facing docs**
   - 把 `PROGRESS.md` / `session-lifecycle.md` 接进 doctor/verify/full-verify
   - 再把 README / AGENTS / CLAUDE / overview / directory-model 的入口统一起来

4. **Task 4：Stop guidance**
   - 依赖 Task 1 的 `PROGRESS.md` / status contract
   - 必须在不破坏原有 validation block 的前提下增强 Stop

5. **最后才做 review / validation / state 收口**
   - 先有 task1-4 pass
   - 再有 verification review pass
   - 最后把 `state.json` 推到 `VALIDATED`

### 3.2 下一条主线的依赖顺序：`gate-hardening-semantics`

**这才是新 session 应该继续的主线。**

当前信息：

- 文件：`/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/state.json`
- 当前状态：`TASKED`
- 当前 task：`null`
- validation：`missing`
- design：`pass`
- plan：`advisory`

**任务顺序必须是：**

1. **Task 1**：冻结 design gate / state / artifact contract，并让 verify 能识别缺口
2. **Task 2**：定义 plan/task gate 的最小消费模型，把 `TASKED` / `EXECUTING` 语义固定下来
3. **Task 3**：把 reviewer verdict / validation freshness 的消费点固定到 verify/stop/runtime contract

**不要跳 Task 1 直接做 Task 2/3。**

### 3.3 新 session 启动后的第一组动作（推荐）

1. 先看动态状态：
   ```bash
   node harness/plugin/runtime/cli.mjs status
   ```

2. 确认当前 active change 仍是旧的已验证 change：
   ```bash
   cat harness/ACTIVE_CHANGE
   ```

3. 把 active change 切到下一条主线：
   ```bash
   bash harness/bin/set-active-change.sh gate-hardening-semantics
   ```

4. 重新确认状态：
   ```bash
   node harness/plugin/runtime/cli.mjs status
   ```

5. 阅读下一条主线的四个核心文件：
   - `harness/changes/gate-hardening-semantics/change.md`
   - `harness/changes/gate-hardening-semantics/design.md`
   - `harness/changes/gate-hardening-semantics/tasks.md`
   - `harness/changes/gate-hardening-semantics/state.json`

6. 从 Task 1 的 RED 开始，而不是先写实现：
   ```bash
   node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs red
   ```

---

## 4. 验证方法

### 4.1 验证当前基线（session lifecycle / progress surface）

如果新 session 只是想确认这条基线没坏，先跑：

```bash
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs status
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs status --json
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs doctor
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify
cd /home/wula/IdeaProjects/sdd && bash hooks/full-verify.sh
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/hooks/stop.mjs
```

### 4.2 验证当前基线的专属 smoke

```bash
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs verify
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs verify
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs verify
cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs verify
```

### 4.3 继续下一条主线时的 RED 起点

#### Task 1
```bash
node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs red
```

预期失败：

```text
Expected DESIGN_APPROVED transition to be blocked when design reviewer verdict is missing or block
```

#### Task 2
```bash
node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs red
```

预期失败：

```text
Expected TASKED transition to reject draft tasks or missing currentTask semantics
```

#### Task 3
```bash
node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs red
```

预期失败：

```text
Expected blocking review verdict or stale validation to fail verification/stop contract
```

### 4.4 当前这条 validated change 的主要验证证据位置

- `harness/changes/session-lifecycle-progress/validation.md`
- `harness/changes/session-lifecycle-progress/reviews/*.json`
- `harness/changes/session-lifecycle-progress/state.json`

---

## 5. 风险点

### 5.1 `ACTIVE_CHANGE` 仍指向旧 change
当前 `harness/ACTIVE_CHANGE` 仍是：

```text
session-lifecycle-progress
```

这不是 bug，但对**新 session 继续做下一条主线**来说是一个风险：

- 如果不切换 active change，SessionStart / status / Stop 会继续把这条已验证 change 当成当前活动 change
- 新 session 很容易误以为“下一步还是修 session-lifecycle-progress”

**所以新 session 第一件事实质上应该是：切 active change。**

### 5.2 `status-summary` 依赖 `PROGRESS.md` 当前格式
`status-summary.mjs` 是用 regex 从 `PROGRESS.md` 抽取：

- `当前阶段`
- `当前目标`
- highlights

所以如果未来改了 `PROGRESS.md` 的 bullet 结构，又没同步这里，会出现：

- `SessionStart` 摘要退化
- `status` 输出字段值不准确

### 5.3 Stop 只是 guidance，不是自动持久化
当前 Stop 的语义是正确的，但很容易被后续 session 误用：

- 它会告诉你该写到哪里
- **但不会替你写** change / progress / memory

后续如果有人想把 Stop 扩成自动写 memory，必须单独立新 change，不能在现有语义上偷偷膨胀。

### 5.4 `gate-hardening-semantics` 仍未进入 EXECUTING/VALIDATED
下一条主线虽然已经 `TASKED`，但当前还没有：

- task-level execution evidence
- fresh validation
- currentTask

所以新 session 不要把它误当成“只差收尾”的状态。它是真正要开始做 Task 1 的。

### 5.5 doc/runtime 双真相误读风险
本轮已经明确：

- 动态真相：`harness/ACTIVE_CHANGE` + `state.json`
- 静态快照：`PROGRESS.md`

如果新 session 只读 `PROGRESS.md`，不读 `status` / `state.json`，还是会误判当前活动 change。

---

## 6. 其他

### 6.1 建议的新 session 阅读顺序
建议按下面顺序读，而不是自己散搜：

1. `README.md`
2. `AGENTS.md`
3. `PROGRESS.md`
4. `CLAUDE.md`
5. `harness/specs/session-lifecycle.md`
6. `harness/changes/gate-hardening-semantics/change.md`
7. `harness/changes/gate-hardening-semantics/design.md`
8. `harness/changes/gate-hardening-semantics/tasks.md`
9. `harness/changes/gate-hardening-semantics/state.json`
10. 本文档

### 6.2 当前真正的 source-of-truth
#### 关于已完成 change
- `harness/changes/session-lifecycle-progress/state.json`
- `harness/changes/session-lifecycle-progress/validation.md`
- `harness/changes/session-lifecycle-progress/reviews/*.json`

#### 关于下一条 change
- `harness/changes/gate-hardening-semantics/state.json`
- `harness/changes/gate-hardening-semantics/tasks.md`
- `harness/changes/gate-hardening-semantics/design.md`

### 6.3 当前不建议继续改的地方
除非发现 regression，否则新 session **不要优先继续改**：

- `session-lifecycle-progress` 的 runtime 行为
- `status`/`SessionStart`/`Stop` 基线
- `PROGRESS.md` 的基本模型

因为这些已经 `VALIDATED`，当前收益最高的不是继续 polish，而是把 gate-hardening 主线推进起来。

### 6.4 当前值得继续借力的命令
```bash
node harness/plugin/runtime/cli.mjs status
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/cli.mjs verify
bash hooks/full-verify.sh
bash harness/bin/set-active-change.sh gate-hardening-semantics
```

### 6.5 当前 change 主线关系
- **已完成并验证**：`session-lifecycle-progress`
- **下一步主线**：`gate-hardening-semantics`
- **当前 `ACTIVE_CHANGE` 仍是旧值**：需要手动切换

---

## 7. 新会话启动提示

把下面这段原样贴给新 session：

> 你现在接手 Enterprise Harness 仓库。先运行 `node harness/plugin/runtime/cli.mjs status`，然后阅读：`PROGRESS.md`、`harness/specs/session-lifecycle.md`、`harness/changes/gate-hardening-semantics/change.md`、`design.md`、`tasks.md`、`state.json`，以及交接文档 `harness/changes/gate-hardening-semantics/evidence/2026-07-15-session-handoff.md`。注意当前 `harness/ACTIVE_CHANGE` 还指向已验证完成的 `session-lifecycle-progress`，所以在继续下一条主线前先执行 `bash harness/bin/set-active-change.sh gate-hardening-semantics`，再重新运行 `node harness/plugin/runtime/cli.mjs status` 确认切换成功。随后按 codegraph-first + TDD，从 issue #11 的 Task 1 开始，先跑 RED：`node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs red`。不要重新打开 `session-lifecycle-progress` 做无目标 polishing，除非你先发现它的 runtime/docs/smoke 有回归。
