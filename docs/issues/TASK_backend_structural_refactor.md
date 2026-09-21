# Task: Backend Structural Refactor to Pragmatic OOP / SOLID Architecture

## Dependency

**Blocked by:** `TASK_backend_oop_solid_agent_rules.md`

Do not start this task until the backend OOP/SOLID rules have been added to `AGENTS.md`.

## Goal

Refactor the existing backend structure to comply with the backend architecture rules defined in `AGENTS.md`.

This is a structural refactor only.

Application behavior must remain unchanged.

## Primary Constraint

**No functional changes.**

The refactor must preserve all externally observable behavior.

## Required Architecture Direction

Where applicable, organize backend responsibilities using the following flow:

```text
Controller / Route
    ↓
Service
    ↓
Repository
    ↓
Database
```

External systems/integrations should be isolated behind dedicated services/adapters where appropriate.

Do not force this structure onto trivial code when doing so would add unnecessary abstraction.

## Refactor Requirements

### Controllers / Routes

Move non-HTTP responsibilities out of routes/controllers.

Controllers/routes should primarily handle:

- request parsing;
- transport-level validation;
- authentication/authorization hooks if already present;
- invoking application services;
- mapping service results/errors to HTTP responses.

Controllers/routes must not directly contain substantial:

- business logic;
- SQL/database logic;
- filesystem persistence logic;
- external API orchestration.

### Services

Move application/business logic into focused services.

Services should:

- implement use-case logic;
- coordinate repositories and integrations;
- contain business rules;
- remain independent from HTTP-specific request/response objects where practical.

Avoid generic `Manager` or oversized god-service classes.

Split services only by clear responsibility.

### Repositories

Move persistence logic into repositories where this improves separation.

Repositories should encapsulate:

- database queries;
- persistence operations;
- storage-specific implementation details.

Business logic must not depend on raw SQL or SQLite-specific behavior unless unavoidable.

Do not introduce repository interfaces solely for ceremony.

### Dependencies

- Prefer explicit dependency injection where it improves testing or dependency isolation.
- Avoid hidden mutable global dependencies.
- Prefer composition over inheritance.
- Avoid circular dependencies.
- Keep dependency direction predictable.

### Existing Utilities

Keep pure functions and small utility modules as functions/modules where that is simpler.

Do not convert every function into a class.

## Compatibility Requirements

The following must remain unchanged unless an internal-only change is strictly required:

- API routes/endpoints;
- HTTP methods;
- request payload formats;
- response payload formats;
- response status semantics;
- public API contracts;
- frontend integration behavior;
- database schema;
- existing stored data compatibility;
- configuration/environment variable names;
- backup/restore behavior;
- update behavior;
- AI feature behavior;
- background-removal behavior;
- existing user-visible functionality.

## Database Constraints

- No schema redesign.
- No destructive migration.
- No data migration solely for architecture cleanup.
- Preserve compatibility with existing SQLite databases.

## Testing

Before refactoring:

- identify existing backend tests;
- identify critical backend behavior not currently covered;
- add characterization/regression tests where necessary to lock current behavior before moving logic.

After refactoring:

- all existing tests must pass;
- newly added regression tests must pass;
- no tests should be changed merely to accept altered behavior.

Prefer testing services independently from HTTP and real database infrastructure where practical.

## Refactor Strategy

Perform the refactor incrementally.

Recommended order:

1. Identify current backend modules and responsibilities.
2. Identify mixed-responsibility routes/controllers.
3. Add regression/characterization coverage for risky behavior.
4. Extract persistence logic into repositories where justified.
5. Extract business/application logic into services.
6. Reduce routes/controllers to transport-level orchestration.
7. Isolate external integrations where justified.
8. Remove obsolete duplicated/dead code created by the old structure.
9. Run the full test suite and verify runtime behavior.

Avoid a full rewrite.

## Non-Goals

Do not:

- add new features;
- redesign the API;
- redesign the database;
- change frontend code unless required for an accidental internal import/build dependency;
- introduce a new framework;
- add a DI container unless there is a concrete need;
- implement Clean Architecture/DDD/CQRS solely for architectural purity;
- create interfaces/factories/base classes without a concrete current use case;
- rename public API fields;
- change business rules;
- change user-visible behavior.

## Code Quality Requirements

After refactoring:

- responsibilities should be easier to identify;
- business logic should be separated from transport/persistence concerns;
- database access should be localized;
- modules/classes should have focused responsibilities;
- dependencies should be explicit and understandable;
- duplication introduced by the previous structure should be reduced;
- architecture must remain proportionate to the size of Inventory Atlas Lite.

## Deliverables

- Refactored backend code.
- Necessary regression/characterization tests.
- Updated backend architecture documentation if existing docs describe obsolete structure.
- Short implementation summary describing:
  - major modules moved/extracted;
  - resulting responsibility boundaries;
  - tests used to verify unchanged behavior.

## Acceptance Criteria

- Dependency task has been completed and current `AGENTS.md` rules are followed.
- No intentionally changed functionality.
- Existing API contracts remain compatible.
- Existing SQLite databases remain compatible.
- Existing frontend works without behavior changes.
- Routes/controllers no longer contain substantial persistence/business logic where separation is justified.
- Business logic is located in focused services.
- Persistence logic is encapsulated appropriately.
- No unnecessary abstraction layer explosion.
- All tests pass.
- Application starts and core backend flows work after the refactor.
