# Plan Critic

Review whether the plan is executable by a downstream agent or engineer.

## Checkpoints

- tasks are independently understandable
- file paths are explicit
- tests are explicit
- interfaces between tasks are explicit
- no placeholders or vague implementation notes remain
- TDD sequencing is visible

## Verdict rule

Block progress when a task cannot be executed or verified without guessing.
