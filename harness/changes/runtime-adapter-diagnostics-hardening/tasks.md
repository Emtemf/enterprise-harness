# Tasks

Status: finalized-plan

## Preconditions
- clarify-ready: issue #13 scope 已收窄为 local adapter schema + diagnostics tightening
- design-approved: pass（见 `reviews/design-reviewer.json`）
- plan-critic verdict: 以最新 `reviews/plan-critic.json` 为准
- current active change: `runtime-adapter-diagnostics-hardening`

### Task 1: 把 local adapter validator 收紧为 field-level diagnostics

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/local-adapter.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/local-adapter.example.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/local-adapter-missing-fields.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/local-adapter-warning-fields.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/local-adapter-malformed.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/local-adapter-read-failure.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/local-adapter-read-failure.meta.json`

**Consumes**
- 当前 example JSON
- 当前 minimal validator

**Produces**
- field-level adapter problems
- hard/soft required 语义分层
- malformed JSON / IO failure 的统一 diagnostics contract
- 更可测试的 validator contract

- [x] 写失败测试
  - 固定 smoke schema：每个 problem 至少包含 `path/code/severity/message/nextAction/source`
  - 固定 fixture 覆盖：missing hard field / warning-only field / malformed JSON / missing file / simulated read failure
  - `simulated read failure` 固定通过 `local-adapter-read-failure.meta.json` 驱动 smoke 注入 fake reader（返回 `EACCES` / IO error），而不是依赖真实权限位
- [x] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs red`
  - Expected failure: 当前 validator 还不能区分 hard fail 与 warn，也不能给出字段级 diagnostics，且无法把 malformed JSON / read failure 转成统一结构化问题
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs green`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-schema-smoke.mjs verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-adapter-diagnostics-hardening/reviews/verification-reviewer-task1.json`

### Task 2: 收紧 setup / doctor / sync 的 adapter diagnostics

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/setup-local-adapter.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/doctor.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/sync.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/install.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/runtime-adapter-temp-repo/`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/runtime-adapter-bootstrap-marker`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/runtime-adapter-command-stubs/`

**Consumes**
- validator field-level problems
- current setup / doctor / sync output shape

**Produces**
- 更清晰的 machine-local diagnostics
- next actions 与 severity 对齐
- setup dry-run / `--write` merge 行为可验证

- [x] 写失败测试
  - 固定 temp repo 布局：`fixtures/runtime-adapter-temp-repo/` 作为 cwd
  - 固定 `HARNESS_LOCAL_ADAPTER` 指向 temp fixture 文件
  - 固定 fake bootstrap marker：`fixtures/runtime-adapter-bootstrap-marker`
  - 固定 PATH stubs：`fixtures/runtime-adapter-command-stubs/` 提供 `codegraph` / `npx` 假命令，避免依赖当前机器工具状态
  - `install.mjs` 的 bootstrap 隔离固定通过 temp repo 内预置 `.bootstrap-ran` marker 与 command stub 实现，不依赖当前机器真实 bootstrap 状态
  - smoke 必须覆盖 `setup-local-adapter.mjs` dry-run / `--write` merge，以及 `install.mjs` 仅透传 setup diagnostics 的行为
- [x] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs red`
  - Expected failure: 当前 setup/doctor/sync/install 还没有字段级 diagnostics、setup 不报告人工确认项、或 next actions 不明确
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs green`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/local-adapter-diagnostics-smoke.mjs verify`
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-adapter-diagnostics-hardening/reviews/verification-reviewer-task2.json`

### Task 3: 对齐 runtime docs / validation

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-adapter-diagnostics-hardening/validation.md`

**Consumes**
- Task 1 / Task 2 的实际结果

**Produces**
- 更准确的 adapter contract 说明
- durable validation evidence

- [x] 写失败测试
- [x] 运行 RED 命令
  - Command: `python - <<'PY'\nfrom pathlib import Path\nchecks = {\n  '/home/wula/IdeaProjects/sdd/README.md': ['local adapter', 'doctor --json'],\n  '/home/wula/IdeaProjects/sdd/harness/plugin/runtime/README.md': ['field-level diagnostics', 'hard fail', 'warning'],\n  '/home/wula/IdeaProjects/sdd/harness/changes/runtime-adapter-diagnostics-hardening/validation.md': ['Task 1 adapter validation command:', 'Task 2 diagnostics validation command:'],\n}\nmissing = []\nfor file, tokens in checks.items():\n    text = Path(file).read_text()\n    for token in tokens:\n        if token not in text:\n            missing.append(f'{file}: missing exact assertion: {token}')\nif not missing:\n    raise SystemExit('UNEXPECTED_PASS')\nprint('\\n'.join(missing))\nraise SystemExit(1)\nPY`
  - Expected failure: 至少一条精确文档/validation 断言未满足
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `python - <<'PY'\nfrom pathlib import Path\nchecks = {\n  '/home/wula/IdeaProjects/sdd/README.md': ['local adapter', 'doctor --json'],\n  '/home/wula/IdeaProjects/sdd/harness/plugin/runtime/README.md': ['field-level diagnostics', 'hard fail', 'warning'],\n  '/home/wula/IdeaProjects/sdd/harness/changes/runtime-adapter-diagnostics-hardening/validation.md': ['Task 1 adapter validation command:', 'Task 2 diagnostics validation command:'],\n}\nmissing = []\nfor file, tokens in checks.items():\n    text = Path(file).read_text()\n    for token in tokens:\n        if token not in text:\n            missing.append(f'{file}: missing exact assertion: {token}')\nif missing:\n    raise SystemExit('\\n'.join(missing))\nprint('OK exact doc assertions passed')\nPY`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `python - <<'PY'\nfrom pathlib import Path\nchecks = {\n  '/home/wula/IdeaProjects/sdd/README.md': ['local adapter', 'doctor --json'],\n  '/home/wula/IdeaProjects/sdd/harness/plugin/runtime/README.md': ['field-level diagnostics', 'hard fail', 'warning'],\n  '/home/wula/IdeaProjects/sdd/harness/changes/runtime-adapter-diagnostics-hardening/validation.md': ['Task 1 adapter validation command:', 'Task 2 diagnostics validation command:'],\n}\nmissing = []\nfor file, tokens in checks.items():\n    text = Path(file).read_text()\n    for token in tokens:\n        if token not in text:\n            missing.append(f'{file}: missing exact assertion: {token}')\nif missing:\n    raise SystemExit('\\n'.join(missing))\nprint('OK exact doc assertions passed')\nPY`
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-adapter-diagnostics-hardening/reviews/verification-reviewer-task3.json`
