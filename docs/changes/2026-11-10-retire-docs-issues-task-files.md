# Retire the docs/issues task files in favor of GitHub Issues (#88)

- **Completed:** 2026-11-10
- **Version:** 0.74.3 (unchanged; documentation and repository hygiene only)
- **Branch:** `techdebt/88-retire-docs-issues-task-files`

## Summary

GitHub Issues are now the only place where planned work is specified. The seven Markdown task
specifications that were still in `docs/issues/` had already been migrated into issues #81–#87, so
they were removed, and the roadmap, the documentation conventions, and the agent rules now point at
the issues. No application code, schema, tests, or runtime configuration changed.

- **Removed task files** (each issue was checked first: it exists, is open, is self-contained, and
  states its scope, dependencies, and acceptance criteria against the current code):

  | Removed file | Canonical issue |
  | --- | --- |
  | `docs/issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md` | #81 Windows Electron distribution |
  | `docs/issues/TASK-CROSS-PLATFORM-DESKTOP-DISTRIBUTION.md` | #82 macOS/Linux Electron distribution |
  | `docs/issues/TASK-HIERARCHY-PHASE-3-DRAG-DROP.md` | #83 Hierarchy drag & drop |
  | `docs/issues/TASK-I18N-ADDITIONAL-LANGUAGES.md` | #84 Five additional UI languages |
  | `docs/issues/TASK-LOCAL-NETWORK-ACCESS.md` | #85 Secure LAN access |
  | `docs/issues/TASK-MULTIPLE-DATABASE-PROFILES-SINGLE-ACTIVE.md` | #86 Multiple database profiles |
  | `docs/issues/TASK-background-removal-quality-phase-2.md` | #87 AI background removal, Phase 2 |

  `docs/issues/.gitkeep` was removed with them, so the directory no longer exists.
- **Regression photo:** `docs/issues/assets/phase-2-svema-ds-4-film-boxes-in-hand.jpg` moved with
  `git mv` (same bytes, SHA-256 `c219acdd…bc3d3`) to `test/fixtures/svema-ds-4-film-boxes-in-hand.jpg`,
  next to the Phase 1 fixture, following the precedent of that photo's move. It is listed in
  `AGENTS.md` and the roadmap as the held-item reference for #87; no test uses it yet.
- **Roadmap:** `docs/ROADMAP.md` links every entry to its issue, states that the issues are
  authoritative, records the dependencies (#82 and #85 on #81; #83, #84, #86, and #87 independent;
  #85 on the existing authentication; #83 respecting the Specific location, lifecycle, and history;
  #86 keeping the instance-wide `auth.sqlite`), and has a short maintenance rule.
- **Agent rules:** `AGENTS.md` replaces the task-file lifecycle with an issue lifecycle (issue →
  branch `<type>/<issue-number>-<slug>` → pull request → merge → closed issue), keeps planned work in
  GitHub Issues, limits the roadmap to a linked summary, and no longer derives branch numbers from
  task file names. `CLAUDE.md` only defers to `AGENTS.md` and needed no change.
- **Documentation:** `docs/README.md` describes the GitHub Issues workflow instead of an `issues/`
  directory; `docs/features/README.md` links to the issues and the roadmap; and
  `docs/features/authentication-and-access.md` links to #85.
- **History:** older records in `docs/changes/` that name removed task files as plain text were kept
  as written. The one clickable link to a removed file, in
  `2026-09-16-proxmox-one-line-installer.md`, now points at that file in its last commit on GitHub.

## Verification

- `git grep` for `docs/issues`, `issues/TASK-`, every removed file name, and `issues/assets` finds
  only the historical plain-text mentions in `docs/changes/`.
- `npm run lint` — clean.
- `npm test` — 442 of 445 passed (one skipped), including `test/docs.test.js`, which checks the
  relative links of the main documents. The two failures are the known Windows-only guide tests in
  `test/landing.test.js` that fail on CRLF checkouts and pass on LF/CI; their files are untouched.
- Playwright was not run: no application, landing, or demo code changed.
