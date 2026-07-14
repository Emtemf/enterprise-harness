# 证据提交规范

## 目标

定义什么可以作为 Enterprise Harness 中的有效证据、证据必须落到哪里，以及会话记录在证据体系中的正确位置。

本规范的目标不是让证据“看起来很多”，而是让完成声明、review verdict 与 validation 结果都能被外部复核。

## 核心原则

### 1. 会话不是唯一真相
聊天上下文、终端会话与 agent 对话可以帮助形成证据，但**不能作为唯一状态来源**。

最终应以仓库内资产为准：

- `harness/changes/<change-id>/validation.md`
- `harness/changes/<change-id>/evidence/`
- `harness/changes/<change-id>/reviews/*.json`
- `harness/changes/<change-id>/state.json`

### 2. 证据要可复核
任何“已完成 / 已修复 / 已通过 / reviewer PASS”的声明，都应让后来的工程师知道：

- 你跑了什么
- 你看到了什么
- 哪些失败或跳过还存在
- 当前结论为什么成立

### 3. 证据要分层
不同类型的信息，应该进入不同资产，而不是全部塞进一处。

## 什么算有效证据

### A. 验证证据（validation evidence）
至少应包括：

- 命令
- 关键输出或结果摘要
- 执行时间或当前批次上下文
- 失败项 / 跳过项 / warning
- 当前结论

典型例子：

- `node harness/plugin/runtime/cli.mjs verify`
- `mvn -f reference-service/pom.xml test`
- `bash hooks/full-verify.sh`

### B. 工具探索证据（tooling evidence）
用于说明：

- codegraph 查询了什么
- Context7 / vendor docs 查了什么
- fallback 原因是什么
- 当前可信度如何

典型落点：

- `harness/changes/<change-id>/evidence/tooling.md`
- `harness/explorations/*.md`

### C. review 证据（review evidence）
用于支撑 reviewer verdict，应至少包含：

- reviewer id
- target change
- findings
- evidence
- verdict
- reviewedAt

典型落点：

- `harness/changes/<change-id>/reviews/*.json`

## 会话记录的正确用法

### 可以做什么
会话记录可以作为：

- 命令执行原始输出的来源
- 一次探索路径的原始材料
- reviewer 或 implementer 的中间推理记录
- 说明“为什么当时做了这个判断”的辅助材料

### 不可以做什么
会话记录**不应**：

- 直接替代 `validation.md`
- 直接替代 `evidence/tooling.md`
- 直接替代 reviewer verdict 文件
- 作为“Claude 说已经通过了”的唯一依据
- 在未整理落盘前，被当成当前 change 的正式状态

### 推荐做法
正确方式是：

1. 从会话记录中提取关键命令、关键输出、关键观察
2. 用人工整理后的形式写入 `validation.md` / `evidence/*.md` / `reviews/*.json`
3. 若确有必要，可在文中引用“来源于某次会话/某段终端输出”，但不要把整段原始聊天直接粘成最终资产

## 资产落点建议

### `validation.md`
放：

- 运行了哪些验证命令
- 结果摘要
- 失败/跳过项
- 当前是否可宣称完成

### `evidence/tooling.md`
放：

- codegraph 查询
- Context7 / vendor docs 查询
- fallback reason
- 关键发现

### `reviews/*.json`
放：

- reviewer verdict
- findings
- 证据摘要

### `change.md`
放：

- 为什么要改
- 影响面
- 决策
- 不放大段原始命令输出

## 禁止事项

- 不得把会话上下文当成唯一状态来源
- 不得只说“我跑过了”而不记录命令与结果
- 不得把旧输出当成当前新鲜验证证据
- 不得把 reviewer 口头结论当成正式 verdict
- 不得让 `VALIDATED` 状态缺少 fresh validation 支撑

## 最小模板建议

### `validation.md` 最少应有
- 验证命令
- 关键结果
- 失败/跳过项
- 结论

### `evidence/tooling.md` 最少应有
- 查询工具
- 查询内容
- 关键发现
- fallback 原因（若有）

### `reviews/*.json` 最少应有
- `changeId`
- `reviewerId`
- `verdict`
- `findings`
- `evidence`
- `reviewedAt`

## 结论

一句话总结：

> 会话记录可以作为证据来源，但不能替代正式证据资产；最终结论必须整理并落盘到仓库内的 change / evidence / review / validation 结构中。
