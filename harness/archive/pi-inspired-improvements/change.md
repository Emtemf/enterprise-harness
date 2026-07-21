# Change

## 原始需求

参考外部仓库 `https://github.com/earendil-works/pi` 的 agent / workflow 设计，找出 Enterprise Harness 值得借鉴和优化的点，把这些优化登记成 issue，并至少实现一个高价值、低风险的优化点。

## 业务结果

把本次外部参考研究转成仓库内可追踪的治理增量：

1. 已登记一组 pi-inspired improvements GitHub issues
2. 选定 `AGENTS.md` 作为第一批低风险实现项
3. 把仓库对人类与非 Claude agent 的 repo-facing 前门补齐，而不是继续只依赖 `CLAUDE.md` 与 `.claude/`

## 非目标

- 本轮不实现全部 pi-inspired issue
- 本轮不重写 runtime/installer
- 本轮不直接引入容器/沙箱运行时实现
- 本轮不把 Enterprise Harness 改造成 pi 的同构复制品

## 归属服务 / 模块 / 业务域

- scope: repo governance / documentation / runtime contract
- owning module: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `harness/specs/`, `harness/plugin/runtime/`
- domain: collaboration entry model / release hygiene / runtime productization inspiration

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: architecture_change, rule_change

## 最小探索证据

- 对 `earendil-works/pi` 公开仓库做了最小研究，读取了 README、AGENTS.md、根 package.json、containerization 文档
- 发现三类值得借鉴的方向：
  1. 顶层 `AGENTS.md` 作为仓库级协作前门
  2. `release:local` 这类 source-external release smoke 模式
  3. 明确的 containerization / sandboxing 指南
- 已把这三类方向登记为 GitHub issues #14 / #15 / #16

## 最终路由

- final tier: L3
- owning scope: repo-facing governance contract
- first implementation slice: issue #14（新增 `AGENTS.md` 作为人类/agent 协作入口）

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- `AGENTS.md` 是否应成为 required project file：本轮决定是
- `AGENTS.md` 与 `CLAUDE.md` 的职责边界：本轮决定前者 repo-facing，后者 Claude Code runtime-facing
- `release:local` 与 containerization 相关优化先登记 issue，不在同一 change 一次性实现

## 假设

- 允许先以文档/contract/doctor/checks 层实现 `AGENTS.md` 支持，而不是等待更大 runtime 版本再统一推进
- 外部参考仓库只作为方法参考，不直接同步其命令面与实现细节

## Waiver

暂无。

## Requirement Review

该需求属于 Enterprise Harness 仓库级治理与协作入口优化，会改变 repo-facing contract 与 runtime required file 集合，按 L3 路由合理。
