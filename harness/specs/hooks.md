---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-21
implementationRefs:
  - hooks/hooks.json
  - hooks/scripts/
  - runtime/lib/hooks/
  - runtime/lib/hook-health.mjs
  - runtime/lib/sessions.mjs
  - runtime/lib/change-locks.mjs
testRefs:
  - runtime/test/hook-manifest-parity-smoke.mjs
  - runtime/test/plugin-native-hooks-smoke.mjs
  - runtime/test/runtime-leases-smoke.mjs
  - runtime/test/hook-health-smoke.mjs
  - runtime/test/hook-health-lifecycle-smoke.mjs
  - runtime/test/subagent-stop-v2-research-persist-smoke.mjs
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
- synchronous path/policy guards for governed `Write`/`Edit`/`NotebookEdit` operations;
- research and governed-write receipt capture;
- SessionEnd cleanup.

Hooks deliberately do **not** gate ordinary reads, shell commands, or Agent dispatch. Skills and
runtime contracts own CodeGraph-first delegation, Context7-first research, handoff binding,
self-check, review, and lifecycle semantics.

They must not interpret requirements, choose architecture, drive lifecycle transitions, or claim
that an agent lifecycle event proves correctness. Agent events are telemetry; durable artifacts,
receipts, and independent reviews provide proof.

## Health and leases

A governed execution requires a fresh hook-health handshake. If host configuration suppresses
or disables hooks, the runtime must report that condition instead of claiming enforcement.

Session and change-lock records live under the git common directory and carry an expiry lease.
The holder renews it through a heartbeat; an expired lease is recoverable only through the
runtime's explicit recovery path. A lease is operational coordination, not completion evidence.

## Native worktrees

Harness uses native Claude Code worktrees. `worktree.baseRef: "head"` is a local setup concern;
Harness does not replace native worktree creation and must preserve `.worktreeinclude` behavior.
Worktrees isolate files, not reasoning context or review independence.

## Failure semantics

Every hook declaration records a bounded timeout and fail mode in
`harness/plugin/hooks-manifest.json`. Critical parse/attribution errors use a stable error code;
no critical `catch` may silently allow an ambiguous governed write.
