# Roadmap overview and task specifications

- **Completed:** 2026-09-18
- **Version:** 0.6.2

## Summary

Added the Dashboard and Tabler UI migration task specifications to the repository. Added
`docs/ROADMAP.md` as the concise index of all active planned features, their dependencies, and their
authoritative task files. Linked the roadmap from the documentation indexes and added an `AGENTS.md`
rule requiring it to be updated whenever active task files change.

## Verification

- Confirmed the roadmap lists every `TASK-*.md` file currently in `docs/issues/` and links to each
  file.
- `npm run lint` passed.
- `npm test` passed: 6 tests passed and 11 deployment-script checks were skipped because their
  required environment was not available.
- `npm run build` passed.
- `npm run test:e2e` passed: 12 Playwright tests passed in Chromium.
- `git diff --check` reported no whitespace errors.
