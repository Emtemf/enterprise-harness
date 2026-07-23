# G4C 用户验收指南

> **用法**：每一步都按 G4C 五维验收。预期效果是"插件应该给你什么"；实际效果是"你实际看到了什么"；如果不一致，按"提 issue 所需证据"收集后提交。

---

## Step 1：会话启动

| 维度 | 内容 |
|------|------|
| **Goal** | 你知道当前项目状态、模型是否就绪、下一步该做什么 |
| **Context** | 插件能读取你的项目结构、active change、技术栈信息 |
| **Choice** | 为什么输出这些而不是更多/更少——只输出恢复所需的最小上下文 |
| **Checkpoint** | 你应该看到 `[Harness 进度卡]` 包含 ✓/▸/○ 阶梯 |
| **Correction** | 如果看不到任何 `[Harness ...]` 输出→插件未安装 |

### 预期效果

会话开头应看到：
```
[Harness 启动检查] .claude/rules=存在 | .claude/agents=存在 | ...
[Harness 入口] 普通用户入口: /harness
[Harness 项目技术栈] language=java | buildTool=maven     ← 如果配置了 project-info.json
[Harness 进度] 当前阶段: ...
[Harness Workflow] 当前 stage: ...
[Harness 进度卡]
┌─ your-change (L2) ─
│ Goal    ▸ 你的目标
│ Choice  ▸ 为什么是 L2
│ Ladder
  ✓ clarify
  ▸ route     ← 当前位置
  ○ design
  ...
│ Next     ▸ /harness
└─
[Harness 工具提醒] 代码探索时请优先使用 codegraph_explore...
```

### 实际效果检查
- [ ] 看到 `[Harness 启动检查]` → ✅
- [ ] 看到 `[Harness 进度卡]` 含 ✓/▸/○ 阶梯 → ✅
- [ ] 技术栈字段不是 `<...>` 未填写 → ✅
- [ ] 没有任何 `[Harness ...]` → ❌ 插件未安装

### 提 issue 所需证据
1. 完整的会话开头输出（前 20 行）
2. `node -p "require('./package.json').version"` 的版本号
3. `ls .claude/skills/harness/` 是否存在
4. `cat .claude/settings.json` 中 hooks 配置

---

## Step 2：代码探索（通过 subagent）

| 维度 | 内容 |
|------|------|
| **Goal** | 在写代码前了解你的项目结构、现有实现、关键文件 |
| **Context** | 插件知道你的项目使用什么框架、有哪些模块、代码在哪 |
| **Choice** | 为什么用 subagent 而不是直接探索——避免污染主对话上下文 |
| **Checkpoint** | Claude 派遣了 `code-explore` / `impact-explore` subagent |
| **Correction** | 如果 Claude 自己直接 grep/Read→不符合预期 |

### 预期效果

- Claude 说"让我先探索一下项目结构"
- 然后通过 **Agent 工具**派遣一个 `code-explore` subagent
- subagent 标题包含**你的项目名或具体探索主题**（如"探索模板模块代码结构"）
- subagent 返回后，Claude 基于 subagent 结论继续

### 实际效果检查
- [ ] Claude 派遣了 subagent（不是自己直接搜索）→ ✅
- [ ] subagent 标题不包含 `enterprise-harness` → ✅
- [ ] subagent 返回后 Claude 没有重新搜索相同内容 → ✅
- [ ] Claude 自己直接 grep/Read 搜索代码（未通过 Agent 工具）→ ❌

### 提 issue 所需证据
1. Claude 的完整思考/动作输出（特别是"搜索"或"读取"部分）
2. 如果用了 Agent 工具：Agent 标题是什么
3. 如果没用 Agent 工具：Claude 是怎么探索的（grep? Read? 直接搜索?）
4. `/model` 查看当前模型

---

## Step 3：需求澄清（苏格拉底式）

| 维度 | 内容 |
|------|------|
| **Goal** | 把模糊需求变成明确可执行的需求 |
| **Context** | 基于 Step 2 的探索结果提问，而不是凭空猜 |
| **Choice** | 为什么一次只问一个问题——避免信息过载导致回答质量下降 |
| **Checkpoint** | Claude 至少向你提了 1 个问题，且用选项式（A/B/C） |
| **Correction** | 如果 Claude 从头到尾没问过问题→直接开始写代码→不符合预期 |

### 预期效果

- Claude 基于探索结果提问："你想做 A 还是 B？"
- 一次只问 1 个问题
- 问题用选项式（A/B/C + 其他），不是开放式
- 你回答后，Claude 确认理解

### 实际效果检查
- [ ] Claude 向你提了至少 1 个问题 → ✅
- [ ] 问题用选项式（A/B/C）→ ✅
- [ ] Claude 基于探索结果提问（不是凭空猜）→ ✅
- [ ] Claude 直接写代码没问过任何问题 → ❌
- [ ] Claude 一次丢出 5+ 个问题 → ⚠️ 不算严重

### 提 issue 所需证据
1. Claude 提了什么问题（原文）
2. 问题是否基于项目代码结构（还是凭空猜的）
3. 你回答后 Claude 做了什么
4. `/model` 查看当前模型

---

## Step 4：变更创建

| 维度 | 内容 |
|------|------|
| **Goal** | 为你的需求建立一个可追溯的变更记录 |
| **Context** | 插件知道你正在做什么、在什么阶段 |
| **Choice** | 为什么需要 change 目录——支持打断后恢复、审计追溯 |
| **Checkpoint** | `harness/ACTIVE_CHANGE` 存在 + `harness/changes/<id>/state.json` 存在 |
| **Correction** | 如果 Claude 直接改代码但没创建 change→不符合预期 |

### 预期效果

- `harness/changes/<change-id>/state.json` 被创建
- `harness/ACTIVE_CHANGE` 指向该 change-id
- `state.json` 中 `tier` 有值（L0/L1/L2/L3）
- `state.json` 中 `goal` 字段有内容（v0.1.19+）

### 实际效果检查
```bash
cat harness/ACTIVE_CHANGE              # 应该有 change-id
cat harness/changes/*/state.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tier'), d.get('goal'))"  # 应有 tier 和 goal
```
- [ ] `ACTIVE_CHANGE` 存在且非空 → ✅
- [ ] `state.json` 中 `tier` 有值 → ✅
- [ ] `state.json` 中 `goal` 有内容 → ✅
- [ ] Claude 直接改了 Java 代码但没有 change 目录 → ❌

### 提 issue 所需证据
1. `cat harness/ACTIVE_CHANGE`
2. `cat harness/changes/*/state.json`（完整内容）
3. `ls harness/changes/`

---

## Step 5：设计文档

| 维度 | 内容 |
|------|------|
| **Goal** | 在写代码前形成完整设计，包含接口、数据、测试策略 |
| **Context** | 基于 Step 2-4 的探索和澄清结果 |
| **Choice** | 为什么先写 design 再写代码——减少返工，让 reviewer 可评审 |
| **Checkpoint** | `design.md` 存在且 ≥ 50 行，含 Problem/Scope/Options/Test Strategy |
| **Correction** | 如果 Claude 直接写 Java 代码但没有 design.md→会被 pre-write BLOCK |

### 预期效果

- `harness/changes/<id>/design.md` 被创建
- 包含：Problem、Scope、Options、Affected Layers、Testing Strategy
- `state.json` 中 `approvals.design.status` 有值
- `reviews/design-reviewer.json` 存在

### 实际效果检查
```bash
wc -l harness/changes/*/design.md      # 应 ≥ 50 行
cat harness/changes/*/reviews/design-reviewer.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('verdict'))"  # 应有 pass/block
```
- [ ] `design.md` 存在且内容充实 → ✅
- [ ] `design-reviewer.json` verdict 为 pass → ✅
- [ ] Claude 直接写代码但没有 design.md → ❌（会被 BLOCK）

### 提 issue 所需证据
1. `ls harness/changes/*/design.md`
2. `wc -l harness/changes/*/design.md`
3. `cat harness/changes/*/reviews/design-reviewer.json`
4. Claude 是否跳过了设计阶段的输出

---

## Step 6：写代码前拦截（pre-write BLOCK）

| 维度 | 内容 |
|------|------|
| **Goal** | 确保 Claude 在满足所有前置条件后才写代码 |
| **Context** | 插件能检测到你的 change 状态和 artifact 完整性 |
| **Choice** | 为什么有 11 道拦截——每道对应一个被跳过的风险 |
| **Checkpoint** | 如果前置条件不满足→看到 `BLOCK:` 消息 + G4C 进度卡 |
| **Correction** | 按 BLOCK 消息提示操作，然后重试 |

### 预期效果

如果 Claude 尝试在条件不满足时写代码：
```
BLOCK: 当前仍处于 design 阶段，design.md 不存在。...
┌─ your-change (L2) ─
│ Goal    ▸ ...
│ Ladder
  ✓ clarify
  ▸ design   ← 缺 design.md
  ○ plan
  ...
│ Correction ▸ 创建 design.md 后重试
│ Next     ▸ /harness-design
└─
```

### 实际效果检查
- [ ] 缺 design.md 时被 BLOCK → ✅（门禁生效）
- [ ] BLOCK 消息后附带 G4C 进度卡 → ✅（v0.1.19+）
- [ ] Claude 在条件不满足时直接写入成功 → ❌（门禁失效）
- [ ] BLOCK 消息没有 G4C 卡 → ⚠️ 插件版本过旧

### 提 issue 所需证据
1. Claude 尝试写文件时的完整 BLOCK 输出（含 G4C 卡）
2. 当前 `state.json` 的完整内容
3. `ls harness/changes/*/design.md`（是否存在）
4. `node -p "require('./package.json').version"` 版本号

---

## Step 7：TDD（RED → GREEN → REFACTOR）

| 维度 | 内容 |
|------|------|
| **Goal** | 先写失败测试证明问题存在，再写最小实现通过测试 |
| **Context** | 基于 design.md 和 tasks.md 中的 RED/GREEN evidence point |
| **Choice** | 为什么 TDD——确保测试覆盖、减少回归风险 |
| **Checkpoint** | 测试先失败（RED）再通过（GREEN） |
| **Correction** | 如果跳过 RED 直接写实现→不符合预期 |

### 预期效果

- Claude 先写测试文件
- 运行测试，测试**失败**（RED）
- Claude 写实现代码
- 运行测试，测试**通过**（GREEN）
- `state.json` 中 `workflow.tddStatus` 依次经过 `test-written` → `red-verified` → `green-verified`

### 实际效果检查
- [ ] 看到测试文件被创建 → ✅
- [ ] 看到测试先失败 → ✅（RED 证据）
- [ ] 看到测试后通过 → ✅（GREEN 证据）
- [ ] Claude 直接写实现没写测试 → ❌

### 提 issue 所需证据
1. Claude 创建了什么测试文件
2. 测试运行的输出（失败和通过各一条）
3. `cat harness/changes/*/state.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('workflow',{}).get('tddStatus'))"`

---

## Step 8：验证（verify + reviewer）

| 维度 | 内容 |
|------|------|
| **Goal** | 确认实现满足设计、测试通过、无回归 |
| **Context** | 基于 Step 7 的 TDD 证据和 Step 5 的 design |
| **Choice** | 为什么需要独立验证——防止自己验收自己 |
| **Checkpoint** | `validation.md` fresh + `verification-reviewer.json` pass |
| **Correction** | 如果 verification 未通过→按 reviewer findings 修复 |

### 预期效果

- `validation.md` 被更新，包含运行了什么命令、结果是什么
- `reviews/verification-reviewer.json` verdict 为 pass
- `state.json` 中 `validation.status` 为 `fresh`
- `cli.mjs verify` 通过

### 实际效果检查
```bash
node harness/plugin/runtime/cli.mjs verify    # 应 OK
cat harness/changes/*/state.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('validation',{}).get('status'))"  # 应 fresh
```
- [ ] `cli.mjs verify` 输出 `OK contract checks passed` → ✅
- [ ] `validation.status` 为 `fresh` → ✅
- [ ] `verification-reviewer.json` verdict 为 pass → ✅
- [ ] `cli.mjs verify` 报错 → ❌

### 提 issue 所需证据
1. `node harness/plugin/runtime/cli.mjs verify` 完整输出
2. `cat harness/changes/*/reviews/verification-reviewer.json`
3. `cat harness/changes/*/validation.md`

---

## Step 9：会话结束（stop hook）

| 维度 | 内容 |
|------|------|
| **Goal** | 防止带着过期验证数据假装完成 |
| **Context** | 插件知道你的 validation 是否 fresh |
| **Choice** | 为什么拦截——确保用户不会在过期状态下结束 |
| **Checkpoint** | 如果 validation stale→被 BLOCK；如果 fresh→正常放行 |
| **Correction** | 刷新验证证据后重试 |

### 预期效果

- 如果 validation 不是 `fresh` 且 state 为 VALIDATED/REVIEWED→被 BLOCK
- 如果 validation 是 `fresh`→正常放行（无输出）

### 实际效果检查
- [ ] validation stale 时被 BLOCK → ✅
- [ ] validation fresh 时正常放行 → ✅
- [ ] validation stale 时未被拦截 → ❌

### 提 issue 所需证据
1. stop hook 的完整输出
2. `cat harness/changes/*/state.json` 中 validation 部分

---

## 快速定位：G4C 五维对照表

| 你遇到的问题 | Goal 缺失 | Context 缺失 | Choice 不清 | Checkpoint 失败 | Correction 不明 |
|---|---|---|---|---|---|
| Claude 没探索直接写代码 | | Step 2 ❌ | | Step 2 ❌ | |
| Claude 没问问题直接写代码 | | | | Step 3 ❌ | |
| Claude 跳过设计直接写代码 | | | Step 5 ❌ | Step 5 ❌ | |
| BLOCK 后不知道怎么恢复 | | | | | Step 6 ❌ |
| BLOCK 没有 G4C 卡 | | | | Step 6 ❌ | Step 6 ❌ |
| 会话中断后不知道做到哪 | Step 1 ❌ | Step 1 ❌ | | Step 1 ❌ | Step 1 ❌ |

## 提 issue 模板

```
### 问题层级
Repo contract / Bug / Feature

### G4C 维度（哪个断了？）
Goal / Context / Choice / Checkpoint / Correction

### 你用的模型
/model 的输出

### 预期效果
对照上面的"预期效果"

### 实际效果
你实际看到的（粘贴输出）

### 证据
[粘贴上面对应的"提 issue 所需证据"]

### 环境
- 插件版本：node -p "require('./package.json').version"
- 项目类型：Java/Maven? 其他?
```
