# Session Handoff — runtime installability / docs 收口 + GitHub CI 门禁修复

## 0. 交接定位

这个 handoff 文件给**新 session**使用，目标不是重复解释仓库愿景，而是让下一个会话可以直接接手：

1. 理解为什么最近这几轮要先改安装入口文案、再修 GitHub 门禁。
2. 明白哪些改动已经落地，哪些只是“代码完成但 change 资产还没补齐”。
3. 能直接继续推进 **`runtime-installability-polish`** 这个 active change，而不是重新摸索上下文。

---

## 1. 背景和决策过程（为什么这么做）

### 1.1 用户真实诉求不是“README 看起来像插件”，而是“真的要像 superpowers 那样安装”

本轮工作的直接触发来自用户连续反馈：

- README 没跟上当前实现
- 现在的安装方式“不像 Claude 插件”
- 希望像 `superpowers` 一样：
  - `claude plugin marketplace add ...`
  - `claude plugin install ...`
  - 后续还能 `marketplace update` / `plugin update`

因此决策不是只做措辞优化，而是分两层处理：

1. **产品入口层**：让仓库已经具备的本地 marketplace 安装/更新路径，被文档准确表达出来。
2. **工程可信度层**：把 GitHub `platform-smoke` 门禁修好，否则所有“已可安装/已可更新”的说法都缺少可信执行面。

### 1.2 为什么要坚持“对用户只有一个入口”

用户明确要求：

- 对普通用户坚持 KISS
- 不要把 runtime/backend 命令暴露成多个前门
- 普通用户侧真正需要记住的只有 `/harness`

因此文档策略改成：

- **plugin marketplace** 是安装方式
- **`/harness`** 是唯一工作流入口
- `bootstrap` / `doctor` / `sync` / `verify` / `start-change` 等只保留为 backend / maintainer / troubleshooting 入口

### 1.3 为什么先修 CI，而不是只停留在本地通过

用户后续又明确指出：

- “GitHub 的门禁都失败了”
- “github流水线门禁一直是失败的，修复”

因此优先级变成：

1. 先把远端 `platform-smoke` 修绿
2. 再继续补 `runtime-installability-polish` 的 durable artifacts

### 1.4 GitHub 门禁失败的真实根因

不是 workflow 随机波动，也不是 CodeGraph 安装失败。

根因分两阶段定位：

#### 阶段 A：先发现 `reference-service-boundary-realignment` 的 digest 漂移

最初失败定位到：

- `harness/changes/reference-service-boundary-realignment/state.json`

原因是本地工作区有额外 evidence log 文件，参与了 `validation.digest` 计算，但 CI clean checkout 中没有这些文件。

所以先刷新了该 change 的 digest。

#### 阶段 B：再发现 Windows 平台依然全量 mismatch

推送后，Linux/macOS 绿了，Windows 仍然红。

进一步定位发现：`computeValidationDigest()` 的跨平台不稳定导致：

1. **路径分隔符不一致**
   - POSIX: `reviews/a.json`
   - Windows: `reviews\a.json`
2. **换行符不一致**
   - POSIX checkout 常见 `LF`
   - Windows checkout 可能出现 `CRLF`

因此最终决定：

- 在 digest 构建时统一把相对路径规范化成 `/`
- 在 digest 构建时统一把文件内容规范化成 `\n`

这是最小、最集中、最不破坏外层 contract 的修法。

---

## 2. 完整的改动内容（每个文件具体改什么，精确到代码片段）

> 下面只列**本轮关键变更**，重点是让新 session 能快速判断“哪些已经做完，哪些还欠 change 资产收口”。

### 2.1 `README.md`

#### 改动目标

把用户视角从“很多 runtime 命令”收口成：

- 安装：plugin marketplace
- 使用：只记住 `/harness`
- backend 命令：留给 maintainer / 排障

#### 关键变更片段

旧版这里还列了大量 runtime/backend 命令；现在改成：

```md
### 4. 安装后怎么进入工作流
安装插件后，对普通用户来说，后续只需要记住一件事：

- **直接从 `/harness` 开始**

也就是说：

- 安装方式可以是 plugin marketplace
- 但使用入口仍然只有 `/harness`
- 不需要先记住 `bootstrap` / `doctor` / `sync` / `verify` / `start-change`

如果你不是在做仓库维护、低层排障或 runtime 开发，就可以忽略 backend 命令。
```

并新增“需要低层控制时再看哪里”：

```md
### 5. 需要低层控制时再看哪里
如果你是 maintainer / repo operator，或者要排查安装问题，再去看这些低层资料：

- `docs/zh-cn/installation-guide.md`
- `harness/specs/plugin-runtime.md`
- `CLAUDE.md`
```

#### 影响

- README 不再把 runtime 命令当普通用户 onboarding 主线
- 保持和用户“KISS + 单一前门”要求一致

---

### 2.2 `docs/zh-cn/installation-guide.md`

#### 改动目标

把文档结构显式拆成两段：

1. 普通用户路径：安装后直接 `/harness`
2. maintainer/排障附录：backend 命令

#### 关键变更片段

新增用户导向段落：

```md
## 5. 安装后怎么用

对普通用户来说，安装完成后只需要记住：

- **进入 Claude Code 会话**
- **直接从 `/harness` 开始**

也就是说：

- plugin marketplace 是**安装方式**
- `/harness` 是**唯一工作流入口**
- `bootstrap` / `doctor` / `sync` / `verify` / `start-change` 这些都不是普通用户前门
```

新增 maintainer / operator / 排障附录分界：

```md
## 6. 如果你是 maintainer / operator / 排障者
只有在你需要低层控制、排查安装问题、或维护 runtime 时，才需要继续阅读这些 backend 命令与资料。

普通用户到这里就可以停止阅读：

- 安装插件
- 打开 Claude Code
- 输入 `/harness`
```

#### 影响

- 安装教程已不再把 direct CLI 当作普通用户默认路径
- backend 命令保留，但降级为附录

---

### 2.3 `docs/zh-cn/overview.md`

#### 改动目标

统一项目定位：

- 已具备本地 marketplace install/update path
- 但对用户工作流入口仍然只有 `/harness`

#### 关键变更片段

Portable Runtime 描述改成：

```md
### 2. Portable Runtime（跨平台运行层）

由每台机器自行适配，主要服务于：

- plugin / repo 的后台运行
- maintainer / operator 的低层控制
- hooks、doctor、sync、verify 等 runtime contract 消费

普通用户不把它当成前门；对用户真正暴露的工作流入口仍然是 `/harness`。
```

项目状态定义改成：

```md
> **已具备 Claude Code 本地 marketplace 可安装/可更新路径、且对用户保持单一入口 `/harness` 的 repo contract + portable runtime MVP。**
```

#### 影响

- 对外项目定位与 README/安装教程一致
- 明确区分“本地 marketplace 可用”与“公共 marketplace 未承诺”

---

### 2.4 `AGENTS.md`

#### 改动目标

让仓库级协作合同与用户-facing 文档一致：

- 安装路径可以是 marketplace
- 但普通用户前门仍然只有 `/harness`

#### 关键变更片段

```md
这条路径更接近 superpowers 的安装/更新体验；但对普通用户真正需要记住的工作流前门仍然只有 `/harness`。
```

以及：

```md
这些命令是 `/harness` 背后的确定性 backend 动作，不是与 `/harness` 平级的第二个用户入口；普通用户按 SOP 使用时不需要先记住它们。维护者只在需要低层控制时再使用。
```

#### 影响

- AGENTS 文案不再与 README 产生入口冲突

---

### 2.5 `harness/changes/reference-service-boundary-realignment/state.json`

#### 改动目标

修复最初造成 CI mismatch 的一个具体 change digest。

#### 关键变更片段

```json
"validation": {
  "status": "fresh",
  "digest": "1835c544d48e59485bdd398af2039c66a836510bf9697f509e0f3730a1b79c35",
  "validatedAt": "2026-07-17"
}
```

替换了旧值：

```json
"digest": "a8e67967c1b1e57f16d7293ea01233fbd178d54a1832ec11644619e068a79838",
"validatedAt": "2026-07-13"
```

#### 影响

- 这是 CI 修复的第一步，但不是最终根因修复
- 真正的跨平台修复在 `checks.mjs`

---

### 2.6 `harness/plugin/runtime/lib/checks.mjs`

#### 改动目标

让 `computeValidationDigest()` 跨平台稳定：

- 路径统一 `/`
- 内容统一 `\n`

#### 新增函数片段

```js
export function normalizeDigestPath(relPath) {
  return String(relPath).replaceAll('\\', '/');
}

export function normalizeDigestContent(text) {
  return String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
```

#### `collectChangeFiles()` 关键修复

旧逻辑：

```js
const relPath = path.join(relDir, entry.name);
```

新逻辑：

```js
const relPath = normalizeDigestPath(path.join(relDir, entry.name));
```

#### `computeValidationDigest()` 中 state 内容规范化

旧逻辑：

```js
hash.update(JSON.stringify(normalizedState));
```

新逻辑：

```js
hash.update(normalizeDigestContent(JSON.stringify(normalizedState)));
```

#### `computeValidationDigest()` 中文件路径和内容规范化

旧逻辑：

```js
const fullPath = path.join(changeDir, relPath);
hash.update(`${relPath}\n`);
hash.update(fs.readFileSync(fullPath, 'utf-8'));
```

新逻辑：

```js
const normalizedRelPath = normalizeDigestPath(relPath);
const fullPath = path.join(changeDir, ...normalizedRelPath.split('/'));
hash.update(`${normalizedRelPath}\n`);
hash.update(normalizeDigestContent(fs.readFileSync(fullPath, 'utf-8')));
```

#### 影响

- 彻底修复 Windows 下 `validation digest mismatch`
- 不需要改 `verify.mjs` / `lifecycle.mjs` 外层 contract

---

### 2.7 `harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`

#### 改动目标

把 digest smoke 从“只测基础语义”扩展为“能覆盖跨平台路径/换行问题”。

#### 新增 import

```js
import crypto from 'node:crypto';
import { normalizeDigestContent, normalizeDigestPath } from '../lib/checks.mjs';
```

#### 关键测试入口调整

旧版走 CLI 子命令：

```js
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
```

新版直接测 verify 脚本：

```js
const verifyPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'verify.mjs');
```

#### 新增 portable digest oracle

新增函数：

```js
function computePortableDigest(repoCopy, changeId) {
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  const hash = crypto.createHash('sha256');
  ...
  hash.update(normalizeDigestContent(JSON.stringify(normalizedState)));
  ...
  hash.update(normalizeDigestContent(fs.readFileSync(fullPath, 'utf-8')));
  ...
  return hash.digest('hex');
}
```

#### 新增更深层的 nested fixture

```js
fs.mkdirSync(path.join(changeDir, 'specs'), { recursive: true });
writeText(path.join(changeDir, 'evidence', 'nested', 'tooling-extra.md'), '# Extra Tooling Evidence\n');
writeText(path.join(changeDir, 'specs', 'nested', 'digest-contract.md'), '# Digest Contract\n');
```

#### 新增断言

```js
const portableDigest = computePortableDigest(repoCopy, changeId);
const hasPortableDigest = afterValidated.validation?.digest === portableDigest;
const hasNormalizedWindowsPath = normalizeDigestPath('reviews\\nested\\advisory-reviewer.json') === 'reviews/nested/advisory-reviewer.json';
```

并把 `ok` 条件扩成：

```js
const ok = validated.status === 0
  && hasComputedDigest
  && hasPortableDigest
  && verifyAfterMutation.status !== 0
  && hasVerifyDigestFailure
  && hasPostWriteStale
  && hasNormalizedWindowsPath;
```

#### 影响

- 这个 smoke 现在不仅验证“caller-supplied digest 会被忽略”
- 还验证“平台无关 digest 计算”的 contract

---

## 3. 实施顺序和依赖关系

### 3.1 已完成顺序（真实发生过的顺序）

1. **先收口用户侧文档入口**
   - `README.md`
   - `docs/zh-cn/installation-guide.md`
   - `docs/zh-cn/overview.md`
   - `AGENTS.md`
2. **发现 GitHub 平台门禁失败**
3. **先修单个 change 的陈旧 digest**
   - `harness/changes/reference-service-boundary-realignment/state.json`
4. **发现 Windows 仍失败**
5. **定位 shared digest builder 跨平台问题**
   - `harness/plugin/runtime/lib/checks.mjs`
6. **补强回归 smoke**
   - `harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`
7. **再次 push 并观察 `platform-smoke`**
8. **最终三平台全绿**

### 3.2 当前状态依赖图

#### 已经完成

- 远端 `main` 已包含 CI 修复提交
- `platform-smoke` 已全绿
- plugin-first + single-entry 文档已落地

#### 仍未完成 / 需要下个 session 继续

当前 active change 仍是：

- `runtime-installability-polish`

但它的状态还停在：

- `state=DISCOVERED`
- `workflow.stage=clarify`
- `validation=stale`
- 缺少 `requirements.md`

也就是说：

- **实现和文档已经改了**
- **但 durable change 资产还没有完成补账**

### 3.3 新 session 应继续的推荐顺序

#### 第一步：先补 change 资产，而不是继续散改代码

优先处理：

1. `harness/changes/runtime-installability-polish/requirements.md`（当前缺失）
2. 更新 `change.md`
3. 更新 `design.md`
4. 更新 `tasks.md`
5. 更新 `validation.md`
6. 更新 `state.json`
7. 补齐 reviewer verdict（如本轮决定正式推进到 design/plan/verify）

#### 第二步：让 active change 与仓库事实重新对齐

当前 `runtime-installability-polish` 的 `state.json` / `validation.md` 仍然落后于真实完成度。

至少应把这些事实写进去：

- 本地 marketplace install/update path 已可用
- 文档已转为 plugin-first + `/harness` single-entry
- GitHub `platform-smoke` 已全绿
- 本轮未做公共 marketplace 发布

#### 第三步：再决定是否需要额外产品化收尾

如果用户下一轮继续追问“接下来任务”，才考虑：

- 是否给 `runtime-installability-polish` 补 reviewer verdict
- 是否把这轮交付沉淀为新的 spec / progress 更新
- 是否再开新 change 做更强 distribution / installer / public marketplace 路线

---

## 4. 验证方法

### 4.1 本地验证（已通过）

#### validation digest 回归 smoke

```bash
node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green
node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs verify
```

预期：

- 都返回成功
- 覆盖 digest 的 caller-supplied ignore / stale after mutation / cross-platform normalization contract

#### runtime verify

```bash
node harness/plugin/runtime/verify.mjs --json
```

预期关键字段：

```json
{
  "ok": true,
  "contractChecks": {
    "ok": true,
    "problems": [],
    "todoHits": []
  },
  "runtimeReadinessChecks": {
    "ok": false,
    "status": "not-run"
  }
}
```

> 注意：`runtimeReadinessChecks.ok` 这里是设计如此，不表示失败；`verify` 本来就只背书 contract checks。

### 4.2 GitHub 验证（已通过）

最新全绿 run：

- `platform-smoke` run id: `29555278787`

三平台结果：

- `ubuntu-latest` ✅
- `macos-latest` ✅
- `windows-latest` ✅

### 4.3 新 session 补账后建议再跑一次

如果新 session 更新了 `runtime-installability-polish` 的 change 资产，建议至少再跑：

```bash
node harness/plugin/runtime/cli.mjs verify --json
node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs verify
```

如果动了 CI-sensitive 文件，再观察 GitHub：

```bash
gh run list --workflow platform-smoke --limit 3
gh run watch <run-id> --exit-status
```

---

## 5. 风险点

### 5.1 最大风险：active change 事实与代码事实继续漂移

当前最显著的风险不是代码坏，而是：

- `runtime-installability-polish` 的 durable artifacts 仍然停在旧阶段
- 新 session 如果只看 `state.json`，会误以为本轮还没开始 design

### 5.2 不要把“本地 marketplace 可安装”误写成“公共 marketplace 已发布”

现在可以准确说：

- **本地 marketplace add / install / update 已可用**

但还不能说：

- 已上官方/公共 marketplace
- 已经可以全局搜索安装
- 已经做了 npm registry/installer/productized 发布闭环

### 5.3 不要把 `/harness` 入口又写散

用户已经明确要求：

- 普通用户前门只有 `/harness`

因此后续补文档或 change 资产时，不要又把 `doctor` / `sync` / `verify` / `start-change` 写回用户主线。

### 5.4 digest 相关改动不要随意绕开 shared helper

以后如果还有 validation digest 相关逻辑，优先复用：

- `normalizeDigestPath()`
- `normalizeDigestContent()`
- `computeValidationDigest()`

不要在别处手写另一套 path/content normalization。

### 5.5 verify 的 JSON 结构不要回退

当前 `verify` 合同是：

- `contractChecks`
- `runtimeReadinessChecks`

不要把它改回“单个 ok 表示一切都 passed”的旧口径，否则会破坏前面已经固化的 runtime contract。

---

## 6. 其他

### 6.1 最近关键提交

```text
50e0ff5 fix: normalize validation digest content
3521fec fix: normalize validation digest paths
f769707 chore: fix validation digest for reference-service change
71dbdd3 docs: separate maintainer appendix from user path
62ce60a docs: move runtime controls to maintainer appendix
61f8fe6 docs: hide runtime commands from user entry path
47311ee docs: reduce runtime commands in user-facing entry docs
```

### 6.2 当前仓库动态真相

`node harness/plugin/runtime/cli.mjs status` 当前输出要点：

- 当前阶段：clarify-first staged orchestrator 已完成第一版骨架
- active change：`runtime-installability-polish`
- active change state：`DISCOVERED`
- validation：`stale`
- 当前 workflow stage：`clarify`
- 当前缺口：**缺少 `requirements.md`**
- 推荐恢复入口：`/harness-design`

### 6.3 当前最应该补的不是代码，而是资产

对于下个 session，最不该做的是：

- 再继续改 README/overview 的措辞细节
- 再无目标地跑一轮 CI
- 重新探索 plugin marketplace 机制

最应该做的是：

- 把 `runtime-installability-polish` 这个 active change 的 requirements/design/validation/state 补齐
- 让 durable artifacts 追上已经落地的 repo 事实

### 6.4 可直接参考的 change 文件

目录：

```text
harness/changes/runtime-installability-polish/
```

当前已有：

- `change.md`
- `design.md`
- `tasks.md`
- `validation.md`
- `state.json`
- `evidence/improve README and plugin-like install path-exploration.md`
- `evidence/tooling.md`
- `reviews/verification-reviewer-task1.json`

当前缺少：

- `requirements.md`

### 6.5 建议的新 session 最小目标

建议把下个 session 的最小可交付定义为：

1. 为 `runtime-installability-polish` 新增 `requirements.md`
2. 把 `state.json` 从“clarify/discovered/stale”推进到与现实一致的阶段
3. 刷新 `validation.md`，记录：
   - plugin marketplace 本地安装/更新路径
   - `/harness` single-entry 文档收口
   - `platform-smoke` 全绿证据
4. 跑一次本地 verify，确保补账不破坏现有绿灯

---

## 7. 新会话启动提示

> 继续当前 active change `runtime-installability-polish`，不要重新探索 plugin marketplace 机制；先补 `harness/changes/runtime-installability-polish/requirements.md`，再把 `change.md` / `design.md` / `tasks.md` / `validation.md` / `state.json` 更新到与当前仓库事实一致。已知事实：本地 marketplace install/update 已可用、普通用户唯一入口仍是 `/harness`、GitHub `platform-smoke` run `29555278787` 已三平台全绿。