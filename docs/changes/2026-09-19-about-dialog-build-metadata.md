# About dialog and build metadata

- Completion date: 2026-09-19
- Resulting project version: 0.9.0

Added an **About** entry to the shared navigation list, so it appears both in the folded desktop
sidebar and in the mobile drawer. It opens a compact Tabler modal showing the product mark and name,
the version, the build revision, the source date, the developer, and a link to the GitHub
repository. The dialog is Bootstrap modal markup driven by Vue state, with an `Escape` handler,
focus containment, focus restore, a scroll lock, and close controls in the header, the footer, and
on the backdrop; no Bootstrap JavaScript is loaded. Choosing About in the mobile drawer closes the
drawer first, which is why `AppNavigation` now emits `navigate` for it.

The version, build, and build date are resolved once in `vite.config.js` and injected through Vite's
`define`. The order is the `APP_*` (or `VITE_APP_*`) environment variables, then the Git tag on
`HEAD` with its leading `v` stripped, then the `package.json` version marked `-dev` in a working
copy, with `unavailable` for the build and the date when no repository is present. The date is the
commit timestamp in UTC, so rebuilding the same revision shows the same source date. Keeping the
resolution in the Vite config rather than a separate script keeps the existing Docker build working
unchanged. `client/src/build-info.js` is the single module the interface reads, and no component
holds a release constant.

Also bumped the project to 0.9.0 and made the release-version test read the committed version from
`package.json` instead of hard-coding it, so a normal version bump no longer requires editing it.

Documentation: added `docs/features/about-dialog.md` and its index entry, recorded the new
navigation entry in `docs/features/application-ui.md`, added a *Check which version you are running*
section and a troubleshooting row to `docs/HOW-TO.md`, removed the completed item from
`docs/ROADMAP.md`, and deleted `docs/issues/TASK-ABOUT-DIALOG-BUILD-METADATA.md`.

Verification: `npm run lint`, `npm test` (21 passed, 1 shellcheck skip), `npm run build`, and
`npm run test:e2e` all pass; Playwright ran 19 Chromium tests including the three new
`test/e2e/about.spec.js` cases. All four metadata paths were resolved directly from the Vite config:
environment variables (`v0.9.0` → `0.9.0`), a Git tag on `HEAD`, an untagged working copy
(`0.9.0-dev`, commit `1886137`, `2026-09-19`), and a directory without a repository. The dialog was
inspected in Chromium in both colour modes at 1440 px and on a 390 × 844 screen.
