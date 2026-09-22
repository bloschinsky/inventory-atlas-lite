# Version History in the About dialog

**Completed:** 2026-09-22
**Version:** 0.21.0

## What was implemented

A **Version History** action was added to the About dialog. It opens a separate, wider Tabler modal
with a vertical steps timeline of the releases of Inventory Atlas Lite, newest first, each with its
date and a short list of user-visible additions, improvements, and fixes. The running release is
marked **Installed**, the list scrolls inside the modal body, and `Escape`, the **×**, the footer
**Close** button, and a click on the backdrop close it and return the focus to the button that opened
it. The About dialog stays open behind it and takes neither the keyboard nor the focus meanwhile.

The history itself is repository-owned data in `shared/release-history.json`, bundled into the
client, so the dialog makes no API or GitHub request and works on an isolated LAN. The entries for
`0.5.0` to `0.20.1` were reconstructed from the release tags and the records in `docs/changes/`;
patch-only releases carry one short fix or maintenance entry instead of invented feature text.

`shared/releaseHistory.js` is the single reader of that format for both the client and the pipeline.
It normalizes entries and drops anything unusable — a malformed entry, an invalid version, an entry
without a change, a duplicate version — so damaged data can never crash the About dialog, and an
unusable date only costs that entry its date.

The release pipeline now uses the same entries: `scripts/release-notes.mjs` prints the user-facing
notes of a tag, the validation job runs it so a tag without a valid entry fails before anything is
published, and the publishing job appends the existing Docker and Proxmox deployment line to those
notes and passes them with `--notes-file` instead of `--generate-notes`.

## Files

- `shared/release-history.json`, `shared/releaseHistory.js` — the stored releases and their format.
- `client/src/releaseHistory.js`, `client/src/components/VersionHistoryDialog.vue`,
  `client/src/about.js`, `client/src/components/AboutDialog.vue`, `client/src/App.vue`,
  `client/src/style.css` — the dialog and the action that opens it.
- `scripts/release-notes.mjs`, `.github/workflows/release.yml` — the release notes generated from the
  same source.
- `test/releaseHistory.test.js`, `test/release.test.js`, `test/e2e/version-history.spec.js`,
  `test/e2e/about.spec.js` — coverage.
- `docs/features/version-history.md`, `docs/features/README.md`, `docs/features/about-dialog.md`,
  `docs/features/github-release-pipeline.md`, `docs/HOW-TO.md`, `docs/ROADMAP.md` — documentation,
  and the completed task file `docs/issues/TASK-version-history-about.md` was removed.

## Verification

- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass.
- Playwright: the full Chromium suite passes, including the four new
  `test/e2e/version-history.spec.js` tests — the timeline opened from About in newest-first order
  with a single **Installed** marker matching the version About reports, scrolling and the keyboard
  and close behaviour, the timeline opening with every network request refused, and the dark colour
  mode.
- The dialog was inspected in Chromium in the light and dark colour modes.
- `node scripts/release-notes.mjs v0.21.0` prints the stored bullets; an unknown tag fails with a
  clear message and a non-zero exit code.
