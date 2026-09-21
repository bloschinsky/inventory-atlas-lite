# Task: Define Backend OOP / SOLID Development Rules

## Goal

Update `AGENTS.md` to define mandatory backend architecture and code-organization rules for all future backend development.

## Requirements

Add a dedicated backend engineering section to `AGENTS.md`.

The rules must require:

- Apply SOLID principles pragmatically.
- Use OOP where it improves:
  - separation of responsibilities;
  - maintainability;
  - testability;
  - extensibility;
  - dependency management.
- Prefer composition over inheritance.
- Follow clear separation of concerns.
- Keep HTTP/API handling, business logic, persistence logic, and external integrations separated.
- Prefer the following backend responsibility flow where applicable:

```text
Controller / Route
    ↓
Service
    ↓
Repository
    ↓
Database / External dependency
```

- Controllers/routes must remain thin and must not contain persistence or substantial business logic.
- Services must contain application/business logic and orchestration.
- Repositories must encapsulate database access and persistence details.
- External integrations must be isolated behind dedicated services/adapters where practical.
- Dependencies should point inward toward application abstractions rather than forcing business logic to depend directly on infrastructure details.
- Keep classes/modules focused on a single clear responsibility.
- Prefer explicit dependencies over hidden global state.
- Design code so important business logic can be tested without requiring the HTTP layer or a real database where practical.

## Anti-Overengineering Rules

Explicitly prohibit unnecessary architectural complexity.

Add rules stating that agents must avoid:

- abstractions without a concrete current need;
- deep inheritance hierarchies;
- one interface per class by default;
- `Interface -> Implementation` duplication where only one implementation exists and no substitution/testing benefit is gained;
- unnecessary factories/builders/managers/providers;
- splitting trivial logic into excessive numbers of classes/files;
- enterprise-style architecture that adds complexity without improving the project.

Do not require OOP for simple pure functions or trivial utilities where a function/module is clearer.

## Decision Rule

Add a rule equivalent to:

> Use OOP and SOLID pragmatically. Introduce an abstraction only when it provides a clear benefit for responsibility separation, substitution, testing, reuse, or dependency isolation. Prefer the simplest structure that preserves clean boundaries.

## Compatibility

Do not modify application functionality as part of this task.

Do not refactor existing backend code in this task.

Only update development/agent instructions.

## Deliverables

- Updated `AGENTS.md`.
- No production-code changes unless strictly required to keep documentation references valid.

## Acceptance Criteria

- `AGENTS.md` contains a clearly identifiable backend architecture section.
- SOLID principles are required but explicitly pragmatic rather than dogmatic.
- OOP is recommended where useful, not mandated for every piece of code.
- Controller/service/repository responsibilities are defined.
- Separation of business logic from transport and persistence layers is defined.
- Composition over inheritance is stated.
- Anti-overengineering constraints are present.
- Existing application behavior is unchanged.
