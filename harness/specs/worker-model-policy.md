---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-09-15
implementationRefs:
  - agents/code-explore.md
  - agents/doc-research.md
  - agents/artifact-worker.md
  - agents/test-design-worker.md
  - agents/implementer.md
  - agents/reviewer.md
testRefs:
  - runtime/test/plugin-agent-surface-smoke.mjs
  - runtime/test/model-uplift-benchmark-smoke.mjs
---

# Worker Model Policy

Enterprise Harness 负责工作流、上下文隔离、证据和门禁，不替用户暗中升级模型。所有 plugin named agent
都声明 `model: inherit`，因此 Code Explore、Doc Research、Design/Test Design artifact worker、Implementer
和独立 Reviewer 使用主会话选择的模型。这样同一套 Skill 在弱模型和强模型上保持相同业务语义，用户的
模型选择同时控制 controller 与 Harness worker。

模型继承不等于模型身份自证。运行时返回的 model 字段只能用于诊断；涉及“弱模型提升”之类的对外结论时，
必须用代理/中转层的请求级回执核验每个实际请求。任何超出实验臂允许集合的模型都令效果样本无效，但该
样本的请求数、逐模型分布、计次单位、token 和耗时仍应保留为资源统计，避免只统计成功样本。

评测可同时设置 `CLAUDE_CODE_SUBAGENT_MODEL` 与 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`，约束主模型之外
可能出现的普通 subagent、teammate 或 workflow agent；`context: fork` 和声明 `model: inherit` 的 Skill
仍以主会话模型为准。最终档位仍由请求级路由回执判定，环境变量或 frontmatter 不能替代该证据。
