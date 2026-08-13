---
name: verify
description: Assemble fresh validation and independent completion evidence.
user-invocable: false
context: fork
---

# Verify

Run the frozen validation commands and gather current task receipts, self-checks, reviews, waivers,
and applicable API/data/security evidence. Validation must bind its input digests and explicitly
record failures, skips, and unsupported inputs.

## Quality loop

The final completion verdict requires an independent `reviewer` run. If a user decision is needed,
return `NEEDS_DECISION`; do not invoke user interaction tools from this forked methodology.
