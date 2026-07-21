# Requirements

## 原始需求

把"每个 change 自动生成一张 GUIDE.md 导航卡"做成机制(模板 + scaffold 自动生成),
以便把 harness 作为插件分发,让陌生用户 + 弱模型新建需求时自动获得导航卡。

## 澄清后的目标

新建 change 时,scaffold 自动在该 change 目录生成 `GUIDE.md`:
- 机械字段(change-id / tier / impact / 验收命令)自动填好
- 业务内容(愿景 / 做什么 / 不做什么)留空待填
- 本轮仅在 **GUIDE.md 缺失** 时给软提醒,不阻断（字段级“未填”检测留待后续反馈再定）

## 范围

- 新增模板 `harness/templates/guide.md`
- 改 `lifecycle.mjs cmdScaffold`:生成 GUIDE.md + 机械字段占位符替换
- 软门禁提示接入现有 guidance surface（本轮覆盖 SessionStart + status summary；Stop 不在范围内）

## 非目标

- 不回填现有 change(仅新建生效)
- 不做硬门禁
- 不引入通用模板引擎(占位符替换仅覆盖 GUIDE 机械字段)
- 不改既有 artifact(change.md/design.md/tasks.md)职责

## 关键参与者 / 用户 / 调用方
- 用户:harness 维护者(本轮)+ 未来插件使用者(陌生用户 + 弱模型)
- Product Owner 视角:导航卡要降低弱模型猜测成本,提升插件可用性
- Principal Architect 视角:占位符替换须最小化,不污染 scaffold 通用性
- Fullstack Developer 视角:改动集中在 lifecycle.mjs + templates,touched files 少
- Quality Engineer 视角:需 scaffold-guide smoke 覆盖"生成 + 机械字段已填"

## 业务上下文

第一性目标是给弱模型兜底(见根 CLAUDE.md 设计谱系)。GUIDE 卡是"随时能瞄一眼的
约束 + 验收入口",让弱模型不必读完整份 change 卷宗即可知道红线与验收命令。

## 约束

- 沿用现有 scaffold 风格:模板文件 + copy;占位符替换只加在 GUIDE 这一项
- 软门禁复用现有 guidance surface,不新建通道
- 全程 TDD:先 RED

## 接口 / API 关注点

无对外 API 变化(api=no)。

## 数据 / SQL 关注点

无持久化 / SQL 变化(data=no)。

## 验收标准

1. `start-change <id>` 后,该 change 目录出现 `GUIDE.md`
2. GUIDE.md 中 change-id / tier / impact / 验收命令路径已自动填入(非占位符残留)
3. GUIDE.md 缺失时,`/harness` 或 SessionStart/Stop 给出补卡提示,但不阻断推进
4. scaffold-guide smoke(red/green/verify)通过
5. 全量回归无退化:`verify` / `doctor` / 现有 smoke 全绿

## 歧义评分
- Goal clarity: 5/5
- Scope clarity: 5/5(4 个澄清点已收敛)
- User/actor clarity: 5/5
- Data/SQL clarity: 5/5(无)
- Interface/API clarity: 5/5(无)
- Acceptance criteria clarity: 4/5(软门禁"未填"判定阈值待 design 细化)
- Constraint/risk clarity: 4/5(占位符替换机制为新引入,design 需定清)
- Overall: 可进入 route/design

## 当前最弱维度

软门禁的"关键字段未填"如何机械判定(留空 vs 占位符残留),留待 design 定义。

## 需要继续澄清的问题

无阻断性问题;上述最弱维度在 design 阶段解决,不需再问用户。

## Repo / 文档事实依据

- `lifecycle.mjs cmdScaffold`:现纯 copy 3 模板,无字符串替换
- `start-change.mjs`:scaffold → exploration → active,无内容填充
- state.json 是唯一有字段赋值先例(changeId/owner/tier)
- 每 change 独立目录,物理隔离

## 用户确认
- 状态: 已确认
- 已确认范围: 自动填机械字段(B) + 软门禁(B) + 仅新建生效(A) + 样品移出(A),tier=L2
- 备注: 用户目标是做成插件对外分发,优先"少猜 + 不粗暴卡人"
