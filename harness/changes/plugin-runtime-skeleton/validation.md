# Validation

## Source Digest

- `harness/specs/plugin-runtime.md`
- `harness/specs/local-runtime-adapter.md`
- `harness/plugin/manifest.json`
- `harness/plugin/runtime/bootstrap.mjs`
- `harness/plugin/runtime/doctor.mjs`
- `harness/plugin/runtime/sync.mjs`
- `harness/plugin/runtime/local-adapter.example.json`
- `hooks/validate-spec-structure.sh`

## Artifact Digest

- active change: `harness/changes/plugin-runtime-skeleton/`
- current state: `DISCOVERED`
- validation date: 2026-07-13

## Commands Executed

### 1. runtime bootstrap

```bash
node harness/plugin/runtime/bootstrap.mjs
```

Observed result summary:

```text
Enterprise Harness Bootstrap
Repo: /home/wula/IdeaProjects/sdd
```

### 2. runtime doctor

```bash
node harness/plugin/runtime/doctor.mjs
node harness/plugin/runtime/doctor.mjs --json
```

Observed result summary:

```text
- required project files 全部 OK
- codegraph status OK
- context7-cli-runtime OK
- active-change OK
- JSON 输出 ok=true, failedCount=0
```

### 3. runtime sync

```bash
node harness/plugin/runtime/sync.mjs
node harness/plugin/runtime/sync.mjs --json
```

Observed result summary:

```text
- manifest 可读
- bootstrap marker 已存在
- local-adapter.example.json 已存在
- CONTEXT7_API_KEY 缺失被降级为 warning，而不是 hard fail
- JSON 输出 ok=true
```

### 4. local adapter setup 与 install skeleton

```bash
node harness/plugin/runtime/setup-local-adapter.mjs
node harness/plugin/runtime/setup-local-adapter.mjs --write
node harness/plugin/runtime/install.mjs --write-local-adapter
```

Observed result summary:

```text
- dry run 会输出本机解析路径
- `--write` 会在本机约定位置创建 local-adapter.json
- install skeleton 会串联 bootstrap + local adapter setup，并给出下一步 doctor 提示
```

### 5. harness structural validation

```bash
bash hooks/validate-spec-structure.sh
bash hooks/full-verify.sh
```

Observed result summary:

```text
Harness structure validation passed.
Full verify（骨架阶段）通过。
```

### 6. cross-platform hook adapter smoke test

```bash
node harness/plugin/runtime/hooks/session-start.mjs
node harness/plugin/runtime/hooks/pre-write.mjs
node harness/plugin/runtime/hooks/post-write.mjs
node harness/plugin/runtime/hooks/stop.mjs
```

Observed result summary:

```text
- session-start.mjs 可输出 contract 启动状态
- pre-write.mjs 在 active change 为 DISCOVERED 时允许 reference-service 路径通过
- pre-write.mjs 在 active change 为 DRAFT 时正确阻断 reference-service 路径写入
- post-write.mjs 与 stop.mjs 可独立执行
```

## Unit Tests

本轮不涉及 Java 单元测试。

## Unit Coverage

不适用。

## Architecture Tests

不适用；本轮是 runtime/plugin 骨架。

## Integration Tests

不适用；本轮没有业务集成路径。

## Backend API E2E

不适用。

## OpenAPI Contract

不适用。

## Google Java Style

不适用。

## Review Verdicts

当前阶段先依赖命令执行与结构校验作为最小验证面，后续可再引入独立 runtime reviewer。

## Skipped Checks

- CI
- Windows / macOS 真机验证
- installer / upgrade automation

## Failures and Retries

- 第一版 `doctor.mjs` 把 Context7 查询失败当成 hard fail；后续已改成 warning/info 语义，避免“有降级路径但整体判死”。

## Final Verdict

当前 portable runtime / plugin skeleton 已达到最小可运行状态：

- repo contract 已明确
- local adapter 规范已明确
- local adapter 约定路径已可 dry-run 与写入
- bootstrap / doctor / sync / install skeleton 可执行
- doctor 与 sync 均支持 JSON 输出
- 结构校验已把 runtime 文件纳入最小 contract
- cross-platform hook adapter 已可独立 smoke test

后续增强应聚焦：更强的 installer、hook adapter 全面替换 shell、machine-local config schema 强化、Windows/macOS 真机验证。
