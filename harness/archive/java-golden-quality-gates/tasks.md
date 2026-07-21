# Tasks

Status: draft-plan

## Preconditions
- clarify-ready: issue #12 scope 已收窄为 ArchUnit + JaCoCo + 本地验证说明
- design-approved: pass（见 `reviews/design-reviewer.json`）
- plan-critic verdict: pending（当前仍在消除 plan blockers）
- current active change: `java-golden-quality-gates`

### Task 1: 用 ArchUnit 取代当前 ad-hoc architecture test

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/pom.xml`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/domain/OrderCancellationPolicyArchitectureTest.java`

**Consumes**
- current package layering
- repository port / mapper boundary matrix
- ArchUnit JUnit 5 docs

**Produces**
- runnable ArchUnit-based architecture test
- 最小依赖方向机械校验

- [x] 写失败测试
  - 先只修改 `OrderCancellationPolicyArchitectureTest.java`，把它改成 ArchUnit JUnit 5 风格；此时 **不要** 先改 `pom.xml`
- [x] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test`
  - Expected failure: 明确的 ArchUnit 缺依赖 / 无法解析符号失败（而不是业务规则失败）
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml test`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-quality-gates/reviews/verification-reviewer-task1.json`

### Task 2: 把 JaCoCo coverage report / check 接进 Maven verify

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/pom.xml`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/application/OrderCancellationServiceTest.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/infrastructure/persistence/JpaOrderRepositoryIntegrationTest.java`
- Modify: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`

**Consumes**
- current test suite
- JaCoCo Maven check docs
- fixed coverage rule：BUNDLE / LINE / 85%
- excludes：`ReferenceServiceApplication` / `config.*` / `*MapperImpl`

**Produces**
- `mvn verify` 可执行的 JaCoCo report / check
- sample 范围内的 coverage gate

- [x] 写失败测试
  - 先只在 `pom.xml` 中接入 JaCoCo `prepare-agent/report/check`，并临时把 line coverage threshold 设为 `100%`，不要先补测试
  - 当前 RED 依据固定为：`OrderCancellationServiceTest` 只有 happy path，`OrderCancellationPolicyArchitectureTest` 只有单条架构断言，因此 bundle 级 100% line coverage 必然失败
- [x] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
  - Expected failure: 明确的 `jacoco:check` coverage fail（用于证明 gate 已真正生效）
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-quality-gates/reviews/verification-reviewer-task2.json`

### Task 3: 明确 reference-service quality profile 的本地验证与后续 CI 接入位置

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/CONTRIBUTING.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-quality-gates/validation.md`

**Consumes**
- issue #12 / #9 的 audit comments
- 当前真实可运行命令
- Task 1 / Task 2 的实际验证结果

**Produces**
- 对外清晰的本地 Java quality gate 说明
- validation artifact 中的 ArchUnit / JaCoCo evidence

- [x] 写失败测试
  - 先定义四条**精确文档断言**：
    1. README 必须包含：`当前本地 Java quality gate 命令：mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
    2. README / CONTRIBUTING 都必须包含：`后续 CI 应复用同一个 Maven verify 命令，而不是重新定义另一套绿灯含义。`
    3. CONTRIBUTING 必须包含：`当前 repo-level full-verify.sh 仍不是 Java quality gate；reference-service 应单独运行 Maven verify。`
    4. validation.md 必须包含以下四条精确行：
       - `Task 1 ArchUnit validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test`
       - `Task 1 ArchUnit validation result summary:`
       - `Task 2 JaCoCo validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
       - `Task 2 JaCoCo validation result summary:`
- [x] 运行 RED 命令
  - Command: `python - <<'PY'\nfrom pathlib import Path\nchecks = {\n  '/home/wula/IdeaProjects/sdd/README.md': [\n    '当前本地 Java quality gate 命令：mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify',\n    '后续 CI 应复用同一个 Maven verify 命令，而不是重新定义另一套绿灯含义。',\n  ],\n  '/home/wula/IdeaProjects/sdd/CONTRIBUTING.md': [\n    '当前 repo-level full-verify.sh 仍不是 Java quality gate；reference-service 应单独运行 Maven verify。',\n    '后续 CI 应复用同一个 Maven verify 命令，而不是重新定义另一套绿灯含义。',\n  ],\n  '/home/wula/IdeaProjects/sdd/harness/changes/java-golden-quality-gates/validation.md': [\n    'Task 1 ArchUnit validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test',\n    'Task 1 ArchUnit validation result summary:',\n    'Task 2 JaCoCo validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify',\n    'Task 2 JaCoCo validation result summary:',\n  ],\n}\nmissing = []\nfor file, tokens in checks.items():\n    text = Path(file).read_text()\n    for token in tokens:\n        if token not in text:\n            missing.append(f'{file}: missing exact assertion: {token}')\nif not missing:\n    raise SystemExit('UNEXPECTED_PASS')\nprint('\\n'.join(missing))\nraise SystemExit(1)\nPY`
  - Expected failure: 至少一条**精确文档断言**未满足，而不是只靠关键词存在性
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `python - <<'PY'\nfrom pathlib import Path\nchecks = {\n  '/home/wula/IdeaProjects/sdd/README.md': [\n    '当前本地 Java quality gate 命令：mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify',\n    '后续 CI 应复用同一个 Maven verify 命令，而不是重新定义另一套绿灯含义。',\n  ],\n  '/home/wula/IdeaProjects/sdd/CONTRIBUTING.md': [\n    '当前 repo-level full-verify.sh 仍不是 Java quality gate；reference-service 应单独运行 Maven verify。',\n    '后续 CI 应复用同一个 Maven verify 命令，而不是重新定义另一套绿灯含义。',\n  ],\n  '/home/wula/IdeaProjects/sdd/harness/changes/java-golden-quality-gates/validation.md': [\n    'Task 1 ArchUnit validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationPolicyArchitectureTest test',\n    'Task 1 ArchUnit validation result summary:',\n    'Task 2 JaCoCo validation command: mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify',\n    'Task 2 JaCoCo validation result summary:',\n  ],\n}\nmissing = []\nfor file, tokens in checks.items():\n    text = Path(file).read_text()\n    for token in tokens:\n        if token not in text:\n            missing.append(f'{file}: missing exact assertion: {token}')\nif missing:\n    raise SystemExit('\\n'.join(missing))\nprint('OK exact doc assertions passed')\nPY`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-quality-gates/reviews/verification-reviewer-task3.json`
