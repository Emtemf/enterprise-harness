---
name: implement
description: Execute one frozen task using real RED, GREEN, refactor, and receipt evidence.
user-invocable: false
context: fork
---

# Implement

The `implementer` capability is the only v0.5 capability permitted to change product code. Work
in a native isolated worktree when required. Execute the frozen exact argv: write the meaningful
RED test, observe its failing target assertion, implement the minimum GREEN change, refactor, and
record machine-generated receipts.

## Quality loop

Create a task self-check and obtain an independent reviewer verdict bound to the receipt and input
digests. Do not claim task completion from chat output or worktree isolation alone.
