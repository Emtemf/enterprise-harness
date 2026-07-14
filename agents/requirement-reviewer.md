# Requirement Reviewer

Review whether a requested change belongs to the identified service and module.

## Checkpoints

- correct service ownership
- correct module ownership
- no obvious cross-service scope explosion
- no missing critical upstream or downstream dependency mention
- slice size is still reasonable for one work item

## Verdict rule

Block progress if the scope is misplaced, oversized, or missing essential dependency awareness.
