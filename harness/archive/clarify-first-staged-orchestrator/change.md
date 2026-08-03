# Change

## 原始需求

把当前 Enterprise Harness 从“显式入口 + hooks + runtime 命令 + durable change 资产并存”的骨架，推进成一个 **Claude Code-only 的 clarify-first staged orchestrator**：

- 用户只从 `/harness` 进入
- 系统先自动探索代码与外部资料，再做**强制澄清**
- 在需求歧义足够低且用户确认后，自动推进到 `design -> plan -> tdd -> verify`
- 每一阶段都有明确模板、gate 和 durable artifact
- 探索默认可拆给 read-only subagent，以降低主会话上下文噪声，适配企业常见的 200k 级上下文约束
- hooks 负责自动提示下一阶段与阻断越级，不承担完整主编排逻辑

## 业务结果

把当前仓库收敛成一个更接近产品形态的 Claude Code workflow harness：

1. **单一前门**：`/harness` 成为唯一推荐用户入口
2. **clarify-first**：需求澄清从“必要时才做”升级为强制第一阶段，并引入苏格拉底式一问一答与 ambiguity scoring
3. **staged workflow**：明确 `clarify -> route -> design -> plan -> tdd -> verify -> archive` 的阶段模型与推进条件
4. **enterprise design gate**：`design` 阶段强制覆盖接口、SQL/数据、架构边界、测试策略等企业检查项
5. **durable artifacts**：requirements/design/tasks/validation/reviews/state 继续落在 repo 内，而不是藏在 prompt/chat 中
6. **subagent exploration**：把高噪声、高分支的探索下沉为 read-only subagent 能力，主 orchestrator 只消费压缩结论与 context packet
7. **automatic next-stage guidance**：SessionStart/Stop/写入 gate 在不接管主编排的前提下，自动提示当前阶段与下一步

## 非目标

- 本轮不先做 Codex / Pi / Cursor 等多宿主 packaging-first 重构
- 本轮不把 `harness/plugin/manifest.json` 升格为 Claude Code 官方 plugin API 代理
- 本轮不追求一次性完成所有 runtime 行为重写
- 本轮不直接替换全部现有 skill/command/hook，而是先建立新的 staged orchestration contract 与最小闭环
- 本轮不把所有 transcript 直接落入 repo durable truth；交互追踪与 repo 资产分层处理

## 归属服务 / 模块 / 业务域

- scope: enterprise harness governance / workflow orchestration
- owning module: `.claude/skills/`, `.claude/settings.json`, `.claude/agents/`, `harness/templates/`, `harness/specs/`, `harness/changes/`, `harness/plugin/runtime/`
- business domain: Claude Code workflow productization / durable change lifecycle / enterprise gate semantics

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: architecture_change, rule_change, platform_rule_change
- reason: 该需求会重定义入口模型、阶段状态机、design/plan/TDD/verify 的消费方式，以及 hooks/skills/agents/runtime 间的边界，不是局部文档或单模块调整

## 最小探索证据

- 当前 `/harness` skill 已明确三层模型：`Skill = 编排`、`Command = 本机/runtime 确定性动作`、`Hooks = 自动提醒/阻断/校验`，并已升级为 clarify-first staged orchestrator contract
- 当前 `SessionStart` / `status` / `Stop` 已能输出 **当前 stage / 当前缺口 / 推荐探索通道 / 恢复入口**，说明 guidance surface 已从纯状态摘要升级为阶段提示面
- 当前 runtime CLI 已有 `start-change` / `status` / `verify` / `doctor` 等 backend hub，说明 backend 面已具备，但主用户入口仍统一回到 `/harness`
- 当前 `.claude/settings.json` 已是真正的 Claude Code hook wiring，说明主架构应建模成 repo-local `.claude` 原生扩展层，而不是先建模成外部分发 plugin
- 浏览器检查的 `superpowers` 可见结构表明其强项在于：workflow-first、skills-first、自动推进、subagent 驱动、shared hooks/skills；但它是 multi-host packaging-first，不能直接照搬顶层形态
- 浏览器检查的 `deep-interview` skill 明确强调：一问一答、ambiguity scoring、weakest-dimension targeting、明确执行确认、先探索再问用户，这些机制非常适合作为本项目的 `clarify` 阶段 contract
- 当前 open issue 列表（#7、#8、#9、#10、#11、#12、#13、#15、#20）已逐个审阅，并整理为 `evidence/open-issues-matrix.md`；当前主线明确定位于 orchestration/gate 分支（#20 + #8/#11），Java golden sample 与 runtime/distribution 归入后续平行轨道

## 最终路由

- final tier: L3
- owning scope: `Claude Code-only staged orchestrator / clarify-first workflow / durable artifact & gate contract`
- next focus: 先冻结阶段状态机、clarify/design/plan/TDD/verify 模板与推进 contract，再逐步把 `/harness`、hooks、templates、subagent exploration 能力接入

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- ambiguity scoring 先采用 0-5 维度分，还是一次性采用更细的 0-100 加权模型
- `review` 是否作为独立阶段，还是先并入 `verify` 的 reviewer/validation 子流程
- `requirements.md` 是否作为新的 durable artifact 一等公民，还是先作为 `change.md`/`design.md` 的前置摘要产物
- exploration packet / context packet 的最小结构是 Markdown 为主，还是同时补 machine-readable JSON
- “自动推进”默认是切换 stage 后继续执行，还是每次阶段切换都先给用户可见 summary 再继续

## 假设

- 当前阶段只针对 Claude Code，repo-native `.claude` 为一等扩展面；多宿主抽象推迟到 staged workflow 核心稳定之后
- 当前可以直接吸收 superpowers 的 methodology 与 deep-interview 的澄清机制，但需要以 OpenSpec 式 durable artifacts 和本仓库 state machine/gate 语义重写
- 当前 200k 企业上下文约束是真实设计边界，因此探索与执行默认采用主 orchestrator + read-only subagent 的上下文分层策略
- 当前 `harness/plugin/runtime/*` 继续作为可选 backend/runtime/packaging 层存在，但不是主产品入口层

## Waiver

暂无。

## Requirement Review

该需求属于仓库级 workflow / rule / architecture 重构，影响后续所有 change 的入口模型、需求澄清方式、设计门禁、TDD 执行与验证收口方式，按 L3 路由是合理的。