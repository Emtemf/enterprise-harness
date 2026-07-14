# Architecture Rules

## Layer model

Java services in this harness follow four explicit layers:

1. **Interface layer** — controllers, transport DTOs, request/response mapping
2. **Application layer** — use-case orchestration and workflow coordination
3. **Domain layer** — business rules, policies, and core domain concepts
4. **Infrastructure layer** — persistence, messaging, external clients, and technical adapters

## Required boundaries

- Controllers stay in the interface layer
- Business rules stay in the domain layer
- Use-case coordination stays in the application layer
- JPA repositories and data-access adapters stay in the infrastructure layer
- Cross-layer shortcuts are not allowed without an explicit documented exception

## Review expectation

Design and code review must identify the layer touched by each change and reject cross-layer leakage.
