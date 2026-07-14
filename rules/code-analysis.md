# Code Analysis Rules

## Default analysis approach

For Java repositories, code analysis must be **codegraph-first** when the indexed graph is available.

Use analysis to identify:

- controllers
- application services
- domain services and policies
- persistence adapters and repositories
- DTOs, entities, and mappers
- impact paths and likely dependencies

## Artifact expectation

Exploration output should be recorded under `harness/explorations/` using the naming pattern:

`YYYY-MM-DD-topic-artifact-type.md`

Examples:

- `2026-07-03-order-batch-cancel-impact.md`
- `2026-07-03-order-batch-cancel-api-diff.md`
