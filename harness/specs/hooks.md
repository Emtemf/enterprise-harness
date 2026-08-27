---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-27
implementationRefs:
  - hooks/hooks.json
  - hooks/scripts/
  - runtime/lib/hooks/
  - runtime/lib/hook-health.mjs
  - runtime/lib/sessions.mjs
  - runtime/lib/prompt-receipts.mjs
  - runtime/lib/state-store.mjs
  - runtime/lib/change-locks.mjs
testRefs:
  - runtime/test/hook-manifest-parity-smoke.mjs
  - runtime/test/plugin-native-hooks-smoke.mjs
  - runtime/test/runtime-leases-smoke.mjs
  - runtime/test/start-change-session-recovery-smoke.mjs
  - runtime/test/hook-health-smoke.mjs
  - runtime/test/hook-health-lifecycle-smoke.mjs
  - runtime/test/subagent-stop-v2-research-persist-smoke.mjs
  - runtime/test/pre-write-governed-target-smoke.mjs
  - runtime/test/governed-bash-allowlist-smoke.mjs
  - runtime/test/change-transaction-lease-smoke.mjs
  - runtime/test/state-store-acquisition-gate-smoke.mjs
  - runtime/test/user-prompt-receipt-hook-smoke.mjs
  - runtime/test/post-write-failure-release-smoke.mjs
  - runtime/test/stop-terminal-fallback-smoke.mjs
---

# Hooks Contract

`harness/plugin/hooks-manifest.json` is the sole maintained hook declaration; `bin/generate-hooks.mjs`
generates the plugin registration at `hooks/hooks.json`. `hooks/scripts/` contains thin entry
wrappers. Policy lives in `runtime/lib/hooks/`; wrappers only parse stdin, call policy, render the
host result, and exit. Generated development settings are a local test projection, never the
released controller path.

## Allowed responsibilities

Hooks may only perform host-boundary mechanics:

- SessionStart health/lease initialization and recovery guidance;
- UserPromptSubmit request-digest capture without retaining prompt text;
- one-retry validation of the exact five-line Clarify fact-gate fallback when an explicitly
  invoked Harness turn is unable to execute research in Plan mode;
- synchronous path/policy guards for governed `Write`/`Edit`/`NotebookEdit` operations;
- research and governed-write receipt capture;
- SessionEnd cleanup.

Hooks deliberately do **not** interpret ordinary reads or Agent dispatch. Skills and runtime
contracts own CodeGraph-first delegation, Context7-first research, handoff binding, self-check,
review, and lifecycle semantics. Shell policy is limited to the active v6 boundary below.

Inside an active v6 workflow, Bash is fail-closed by allowlist rather than classified by a
mutation denylist. Main may run only canonical Harness runtime commands or bounded read-only
diagnostics (`pwd`, `ls`, `rg`, and selected read-only `git` subcommands), without shell
operators, redirects, substitutions, or interpreter escape flags. Main must otherwise use
Write/Edit, and only the bound implementer may launch canonical task-run. Runtime-owned commands
manage their own transaction; read-only diagnostics acquire no write lease. This prevents
equivalent interpreter or utility spellings from deleting hook/runtime coordination while a
write lease is active. Git commands that can invoke configured fsmonitor, textconv, diff, pager,
or hook programs are not in the allowlist; only non-extensible plumbing queries are admitted,
and `rg` must opt out of environment-supplied configuration with `--no-config`.
Generic runtime classification never authorizes `task-run`. Direct writes to the git-common-dir
runtime root are always blocked.

Governed-write enforcement is session-scoped and opt-in. A hook event with no session binding
(or a legacy event with no `ACTIVE_CHANGE`) is outside an active Harness workflow and ordinary
`Write`/`Edit`/`NotebookEdit` must remain available, including under conventional production,
test, and API roots. Once a session binding or legacy active change exists, unresolved state,
expired leases, corrupt bindings, and failed write gates remain fail-closed. A corrupt binding
file is not equivalent to an absent binding. When binding/state resolution fails, arbitrary Bash
also remains blocked; only exact, argument-bounded recovery actions (`doctor`, `doctor-hooks`,
status, same-change renewal, and current-session show/unbind) plus bounded read-only diagnostics
remain available. Other canonical runtime mutators do not become recovery commands merely because
their executable is trusted.

An allowed write acquires a per-change shared lease under the git common directory in PreToolUse and keeps it until the matching
PostToolUse correctness work has run, or PostToolUseFailure releases it. A lifecycle transition and every runtime decision, assessment,
classification, and handoff-result writer acquire the exclusive transaction only when no shared
write lease exists. Both paths serialize through the same coordinator, so authorization cannot
race proof revalidation or the state CAS. `EH-CHANGE-TRANSACTION-150` identifies an active
exclusive transaction and `EH-CHANGE-WRITE-LEASE-151` identifies an in-flight host write.

They must not interpret requirements, choose architecture, drive lifecycle transitions, or claim
that an agent lifecycle event proves correctness. Agent events are telemetry; durable artifacts,
receipts, and independent reviews provide proof.

The plugin-global Stop hook remains recovery guidance only. The Harness Skill frontmatter
registers a separate session-scoped Stop handler after explicit skill invocation; that handler
derives the active Clarify research route from runtime readiness, validates only the fixed response
shape, and returns `decision: block` with deterministic correction text at most once per turn.
`stop_hook_active=true`, non-Plan modes, non-research routes, and internal errors all fail open. It
does not inspect asynchronous transcript text, select a route, execute research, persist a decision,
or prove lifecycle completion. After that shape check it returns immediately: only the plugin-global
Stop may emit recovery guidance. The two registrations keep separate dedup namespaces so a global
Stop invocation cannot suppress the Skill validator, but they never duplicate guidance output.

## Health and leases

A governed execution requires a fresh hook-health handshake. If host configuration suppresses
or disables hooks, the runtime must report that condition instead of claiming enforcement.

Session and change-lock records live under the git common directory and carry an expiry lease.
The holder renews it through a heartbeat; an expired lease is recoverable only through the
runtime's explicit recovery path. Rebinding the same session/change/worktree tuple is idempotent
and serializes lease renewal with bind/unbind through the same per-session file lock; it must not
return an already-expired record. Binding roots are canonicalized through the filesystem before
comparison, so lexical aliases such as macOS `/var` and `/private/var` or an equivalent symlink do
not create a false worktree conflict. `workflow status --json`
reports the bound changeId and the supported `start-change <same-change-id>` recovery action.
Changing to a different binding requires inspection and explicit user authorization before
`sessions unbind`. A lease is operational coordination, not completion evidence.

Filesystem locks and their acquisition/recovery gates carry owner PID, host, token, and
acquisition time. Initial target ownership is written completely to a private sibling file and
published with an atomic no-replace hard link, so a crash cannot expose an ownerless lock. A later
operation quarantines a target lock owned by a dead local process; in a
Git-backed governed workflow, acquisition-gate ownership is replaced only by `update-ref`
compare-and-swap against the exact observed owner. Contenders therefore cannot remove a newer
live gate while recovering an older one. Only a provably dead owner on the current host is
recoverable. Malformed, unknown-host, and foreign-host owners fail closed regardless of age; a
live owner is never replaced.
Write-tool leases are bounded and matching PostToolUse success/failure releases them. This is the
supported crash-recovery path; users do not delete lock directories manually.

## Native worktrees

Harness uses native Claude Code worktrees. `worktree.baseRef: "head"` is a local setup concern;
Harness does not replace native worktree creation and must preserve `.worktreeinclude` behavior.
Worktrees isolate files, not reasoning context or review independence.

## Failure semantics

Every hook declaration records a bounded timeout and fail mode in
`harness/plugin/hooks-manifest.json`. Critical parse/attribution errors use a stable error code;
no critical `catch` may silently allow an ambiguous governed write.
