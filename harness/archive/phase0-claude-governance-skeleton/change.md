# Change

## 原始需求

为本项目执行 Phase 0 骨架改造：把自动加载规则层、reviewer 骨架、根 `CLAUDE.md`、hook 框架与基础模板真正落到仓库中，并默认使用中文文档资产，方便中国与新加坡团队协作。

## 业务结果

让 Claude Code 在本项目中的规则、reviewer、skill 与验证骨架开始从“普通文档”升级为“真实可发现、可验证的治理入口”。

## 非目标

- 这次不重构 `reference-service` Java 实现
- 这次不引入 CI
- 这次不落地 ArchUnit / JaCoCo / MapStruct / HTTP API E2E
- 这次不处理真实 secret 轮换，只定义项目内不落盘密钥的策略

## 归属服务 / 模块 / 业务域

- owning service: harness governance
- owning module: Claude Code project governance
- business domain: enterprise harness

## 初步路由

L2：涉及工作流规则、自动加载层、hook 与资产模板变化。

## 最小探索证据

- 检查当前 `CLAUDE.md`、根 `rules/`、根 `agents/`、`.claude/settings.json`
- 核对 requirement-intake 设计文档与外部参考项目的一手材料
- 发现项目根 `rules/` / `agents/` 不是真实自动加载面

## 最终路由

L2，先完成治理骨架，再进入更深的 Phase 1 / Phase 2。

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- 文档默认中文：已确认
- 是否继续推进 hook + template：已确认

## 假设

- 当前阶段允许先建立 fail-safe hook 骨架，再逐步升级为 hard gate
- 当前仓库不是 Git 仓库，因此继续采用 single-writer

## Waiver

暂无。

## Requirement Review

当前 change 的目标、范围与 tier 已足以支持 Phase 0 骨架落地。
