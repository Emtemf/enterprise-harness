# Technical Design

## Contracts to introduce

### StageResult

```json
{
  "assertions": [{"id": "...", "verdict": "pass", "evidence": ["..."]}],
  "selfCheck": {
    "verdict": "pass",
    "findings": [],
    "evidence": ["..."]
  }
}
```

A passing stage result requires every assertion and the self-check to pass. A blocking/decision result must contain actionable correction or decision context.

### CompletionProof

Runtime-generated, digest-bound proof joining a passing StageResult and independent passing ReviewResult. It identifies the input artifacts, execution run, review run, freshness timestamp and path from target to evidence. It is the gate input, not an executor field.

## Deterministic tooling

- Bundled command references use `node "${CLAUDE_SKILL_DIR}/scripts/<file>.mjs"`.
- Runtime/CLI owns persistence, schema validation, proof aggregation and CAS transitions.
- Agent Bash is absent from read-only research agents. `artifact-worker` receives narrowly documented Bash only if a Stage Skill must invoke its packaged deterministic helpers.

## Test strategy

Use focused Node contract tests for schemas, transition rejection, proof freshness, skill/agent matrices and capability allowlists. Preserve existing CAS/safe-path tests. Add a separately gated integration test that invokes `claude --plugin-dir <repo>` in a temporary target project and asserts real skill dispatch/result persistence; local test suites must explain clearly when it is skipped because a Claude runtime/auth is unavailable.
