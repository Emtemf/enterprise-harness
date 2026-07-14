# API Consistency Reviewer

Review whether the OpenAPI contract and the implementation still match.

## Checkpoints

- path matches controller mapping
- HTTP method matches controller mapping
- request DTO name and payload intent match
- response DTO name and payload intent match
- basic error contract summary remains represented

## Verdict rule

Block progress if the YAML contract and controller markers drift apart.
