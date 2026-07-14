#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

required_dirs=(
  "$ROOT/.claude"
  "$ROOT/.claude/rules"
  "$ROOT/.claude/agents"
  "$ROOT/.claude/skills"
  "$ROOT/.claude/skills/harness-intake"
  "$ROOT/hooks"
  "$ROOT/harness"
  "$ROOT/harness/templates"
  "$ROOT/harness/changes"
  "$ROOT/harness/specs"
  "$ROOT/harness/reviewers"
)

required_files=(
  "$ROOT/CLAUDE.md"
  "$ROOT/.mcp.json"
  "$ROOT/.claude/settings.json"
  "$ROOT/.claude/rules/00-workflow.md"
  "$ROOT/.claude/rules/10-code-analysis.md"
  "$ROOT/.claude/rules/20-documentation.md"
  "$ROOT/.claude/rules/30-java-architecture.md"
  "$ROOT/.claude/rules/40-java-style.md"
  "$ROOT/.claude/rules/50-testing.md"
  "$ROOT/.claude/rules/60-api-contract.md"
  "$ROOT/.claude/rules/70-review.md"
  "$ROOT/.claude/agents/requirement-reviewer.md"
  "$ROOT/.claude/agents/design-reviewer.md"
  "$ROOT/.claude/agents/plan-critic.md"
  "$ROOT/.claude/agents/api-consistency-reviewer.md"
  "$ROOT/.claude/agents/verification-reviewer.md"
  "$ROOT/.claude/skills/harness-intake/SKILL.md"
  "$ROOT/harness/config.yaml"
  "$ROOT/harness/templates/state.json"
  "$ROOT/harness/templates/change.md"
  "$ROOT/harness/templates/spec.md"
  "$ROOT/harness/templates/design.md"
  "$ROOT/harness/templates/tasks.md"
  "$ROOT/harness/templates/validation.md"
  "$ROOT/harness/templates/review-verdict.json"
  "$ROOT/harness/templates/exploration.md"
  "$ROOT/harness/templates/tooling-evidence.md"
  "$ROOT/harness/reviewers/catalog.json"
  "$ROOT/harness/specs/instruction-layering.md"
  "$ROOT/harness/specs/directory-model.md"
  "$ROOT/harness/specs/artifact-lifecycle.md"
  "$ROOT/harness/specs/requirement-intake.md"
  "$ROOT/harness/specs/tool-fallback-policy.md"
  "$ROOT/harness/specs/local-runtime-adapter.md"
  "$ROOT/harness/specs/plugin-runtime.md"
  "$ROOT/harness/specs/mvp-roadmap.md"
  "$ROOT/hooks/session-start.sh"
  "$ROOT/hooks/pre-write-gate.sh"
  "$ROOT/hooks/post-write-gate.sh"
  "$ROOT/hooks/stop-gate.sh"
  "$ROOT/hooks/full-verify.sh"
  "$ROOT/hooks/validate-artifact-state.sh"
  "$ROOT/hooks/validate-review-verdicts.sh"
  "$ROOT/hooks/validate-change-evidence.sh"
  "$ROOT/harness/bin/create-change-scaffold.sh"
  "$ROOT/harness/bin/create-exploration-artifact.sh"
  "$ROOT/harness/bin/update-change-state.sh"
  "$ROOT/harness/bin/set-active-change.sh"
  "$ROOT/harness/bin/show-active-change.sh"
  "$ROOT/harness/bin/set-change-impact.sh"
  "$ROOT/harness/bin/record-review-verdict.sh"
  "$ROOT/harness/bin/mark-design-approved.sh"
  "$ROOT/harness/bin/mark-red-verified.sh"
  "$ROOT/harness/bin/mark-validation-stale.sh"
  "$ROOT/harness/bin/mark-change-reviewed.sh"
  "$ROOT/harness/bin/mark-change-validated.sh"
  "$ROOT/harness/bin/context7-library.sh"
  "$ROOT/harness/bin/context7-docs.sh"
  "$ROOT/harness/plugin/manifest.json"
  "$ROOT/harness/plugin/runtime/doctor.mjs"
  "$ROOT/harness/plugin/runtime/bootstrap.mjs"
  "$ROOT/harness/plugin/runtime/sync.mjs"
  "$ROOT/harness/plugin/runtime/install.mjs"
  "$ROOT/harness/plugin/runtime/setup-local-adapter.mjs"
  "$ROOT/harness/plugin/runtime/upgrade.mjs"
  "$ROOT/harness/plugin/runtime/migrate.mjs"
  "$ROOT/harness/plugin/runtime/local-adapter.example.json"
  "$ROOT/harness/plugin/runtime/local-adapter.schema.json"
  "$ROOT/harness/plugin/runtime/README.md"
  "$ROOT/harness/plugin/runtime/lib/checks.mjs"
  "$ROOT/harness/plugin/runtime/lib/local-adapter.mjs"
  "$ROOT/harness/plugin/runtime/lib/gates.mjs"
  "$ROOT/harness/plugin/runtime/hooks/session-start.mjs"
  "$ROOT/harness/plugin/runtime/hooks/pre-write.mjs"
  "$ROOT/harness/plugin/runtime/hooks/post-write.mjs"
  "$ROOT/harness/plugin/runtime/hooks/stop.mjs"
  "$ROOT/harness/specs/local-runtime-adapter.md"
)

missing=0
for dir in "${required_dirs[@]}"; do
  if [ ! -d "$dir" ]; then
    printf 'Missing required directory: %s\n' "$dir" >&2
    missing=1
  fi
done

for file in "${required_files[@]}"; do
  if [ ! -f "$file" ]; then
    printf 'Missing required file: %s\n' "$file" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  exit 1
fi

printf 'Harness structure validation passed.\n'
