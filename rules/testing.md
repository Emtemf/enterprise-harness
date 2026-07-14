# Testing Rules

## Required testing approach

This harness uses TDD for feature and bug-fix work:

1. write a failing test first
2. run the failing test
3. implement the minimal change
4. re-run the test to pass
5. refactor only when justified

## Minimum test types for Java services

- mock-based unit tests for core application/domain logic
- local DB-backed small integration tests for persistence and controller paths

## MVP enforcement

The first phase MVP must demonstrate both test styles in `reference-service/`.
