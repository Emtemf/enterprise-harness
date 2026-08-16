# Refactor Task List

1. Establish the test matrix and record failing tests for the target contract.
2. Align all skill frontmatter, supporting-file paths and capability-agent tool allowlists.
3. Replace legacy workflow/agent dispatch authority with the six-stage transition graph and v2-only path.
4. Add self-check and runtime completion-proof contracts; remove executor/reviewer-owned final proof claims.
5. Move classification/impact authority into durable artifact pointers and make stale derivation digest based.
6. Reduce hooks to host-bound guards and telemetry; remove legacy duplicate hook manifest truth.
7. Update canonical specifications and upstream attribution for Superpowers, OpenSpec, deep-interview and Grill Me.
8. Add contract, integration and actual Claude Code plugin E2E coverage.
9. Run the complete smoke/verification/release-surface suite and an independent code review.

## Exit criteria

The target graph is the only new-workflow source; the five-agent matrix is fully wired; neither research lane can mutate the checkout; every stage has explicit self-check and fresh external review; and a test demonstrates a plugin invocation instead of only string assertions.
