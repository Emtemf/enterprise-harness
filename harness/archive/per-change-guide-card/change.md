# Change

## 原始需求

把"每个 change 自动生成一张 GUIDE.md 导航卡"做成机制(模板 + scaffold 自动生成),
目标是让这个 harness 作为**插件分发给别人使用**——别人新建需求时应自动获得一张
填了一半的导航卡,弱模型照卡即可知道红线与验收方式,无需手写、无需瞎猜。

已有一张手写样品作为形态原型:`harness/work/per-change-guide-card/guide-prototype.md`。

## 业务结果

1. **新模板** `harness/templates/guide.md`:定义导航卡的稳定结构
   (愿景 / 做什么 / 不做什么 / 编码规范 / 验收标准 / 怎么验收 / 业务知识沉淀)
2. **scaffold 自动生成**:`start-change` 新建 change 时自动产出 `GUIDE.md`,
   并**自动填入机械字段**(change-id / tier / impact / 验收命令路径),业务内容留空待填
3. **软门禁提示**:GUIDE.md 缺失或关键字段未填时,`/harness` / SessionStart / Stop
   给出"该补 GUIDE"提示,但**不阻断**推进

## 非目标

- 不回填现有 change(仅对新建 change 生效)
- 不做硬门禁(缺 GUIDE 不阻断,只提醒)
- 不改动 change.md / design.md / tasks.md 等既有 artifact 的职责边界
- 不引入通用模板引擎;占位符替换只覆盖 GUIDE 所需的少量机械字段

## 归属服务 / 模块 / 业务域

- scope: enterprise harness workflow scaffolding / durable artifact contract
- owning module: `harness/templates/`, `harness/plugin/runtime/lifecycle.mjs`,
  `harness/plugin/runtime/`(scaffold + 软门禁提示接入点)
- business domain: per-change 导航卡机制 / weak-model 兜底 / 插件可分发性

## 初步路由

- request shape: modify(改 scaffold runtime 行为 + 新增模板 + 新增规则)
- candidate tier: L2
- reason: 改动 runtime scaffold 行为并新增一条 durable artifact 规则,属于新能力;
  但不碰架构边界 / API / 数据结构

## 最小探索证据

- `lifecycle.mjs cmdScaffold` 现自动生成 3 文件(change.md / validation.md / evidence/tooling.md),
  全部为**纯 copy 空模板**,无字符串替换;唯一例外是 state.json(读 JSON 后赋值 changeId/owner/tier)
- `start-change.mjs` 依次调 `scaffold → exploration → active`,不做额外内容填充
- 因此"自动填机械字段"需要给 scaffold 引入**第一个占位符替换机制**(GUIDE 专用,最小化)
- 每个 change = 独立目录 `harness/changes/<id>/`,物理隔离,GUIDE 一需求一张,不交叉
- 手写样品已验证形态可用:验收栏贴真实可跑命令(来自 validation.md),而非散文

## 最终路由

- final tier: **L2**
- owning scope: harness workflow scaffolding / durable artifact contract
- next focus: 先定 guide.md 模板结构与占位符集合,再改 scaffold 自动生成 + 填充,
  最后接软门禁提示;全程 TDD(先 scaffold-guide smoke RED)

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: yes(新增"每个 change 应有 GUIDE 导航卡"这条 durable artifact 规则)

## 需要确认的决策(已在 clarify 阶段定案)

1. GUIDE 生成方式 → **B 轻量自动填充**:机械字段自动填,业务内容留空
2. 是否门禁 → **B 软门禁**:提醒不阻断
3. 是否回填现有 change → **A 仅新建生效**
4. 手写样品处置 → **A 移出旧 change**(已移到 `harness/work/per-change-guide-card/guide-prototype.md`)

## 假设

- 目标形态是插件分发,使用者是陌生用户 + 弱模型,因此优先"少猜 + 不粗暴卡人"
- 占位符替换只服务 GUIDE 的机械字段,不升级为通用模板引擎
- 软门禁提示复用现有 SessionStart / Stop / harness 的 guidance surface,不新建通道

## Waiver

暂无。

## Requirement Review

该需求改动 scaffold runtime 行为并新增一条 durable artifact 规则,影响后续所有新建 change
的初始资产结构,按 L2 路由合理。scope 已通过 4 个澄清点收敛(不回填、不硬门禁、
最小占位符替换、样品移出),边界清晰,可进入 design。
