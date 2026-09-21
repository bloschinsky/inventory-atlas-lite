# Define backend OOP/SOLID development rules

**Completion date:** 2026-09-21

**Version:** 0.16.1

## Summary

Added a "Backend architecture and code organization" section to `AGENTS.md` that makes the backend
rules explicit for all future server work. It requires pragmatic SOLID, OOP only where it improves
responsibility separation, maintainability, testability, extensibility, or dependency management,
composition over inheritance, and separation of HTTP handling, business logic, persistence, and
external integrations. It defines the controller → service → repository → database flow together
with the responsibilities of each layer, inward-pointing dependencies, and testability of business
logic without the HTTP layer or a real database.

The section also carries explicit anti-overengineering constraints against needless abstractions,
deep inheritance, interface-per-class duplication, superfluous factories and managers, excessive file
splitting, and enterprise-style architecture, plus the decision rule that an abstraction is only
introduced when it delivers a clear benefit. The data-flow sentence in "Stack and architecture" was
reworded so it points at the new section instead of describing routes that work directly with SQLite.

No application code was changed. The roadmap entry for this task was removed, the dependent backend
structural refactor entry is now recorded as unblocked, the task file was deleted, and the project
version was incremented to 0.16.1 because the change alters the development contract for agents.
No `docs/features/` document was added: this task changes agent instructions only and introduces no
user-facing behavior.

## Verification

- `npm run lint` passed.
- `npm test` passed.
- Reviewed `AGENTS.md` against every acceptance criterion in the task specification.
- `git diff --check` passed with no whitespace errors.
- Playwright was not run because this documentation-only change does not alter browser behavior.
