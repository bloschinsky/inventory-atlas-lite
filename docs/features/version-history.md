# Version History

## Summary

The About dialog offers a **Version History** action that opens a larger dialog with the releases of
Inventory Atlas Lite and their user-visible changes, newest first. The history is repository-owned
data bundled into the application, so it opens on an isolated LAN with no internet connection and
without a single API or GitHub request. The same entries are the source of the user-facing notes of
every published GitHub Release.

## User-visible behaviour

- **About** → **Version History** opens a separate, wider Tabler modal. The compact About dialog
  stays open behind it and is not expanded.
- Releases are listed newest first, by version number rather than by their order in the stored file.
  Each entry shows `v<version>`, its release date when one is known, and a short list of the
  additions, improvements, and fixes a user can notice. A patch-only technical release carries a
  single short entry instead of invented feature text.
- The running release is marked with an **Installed** badge and the active step of the timeline. A
  development build reporting `0.21.0-dev` is matched to the `0.21.0` entry.
- The timeline is Tabler's vertical steps inside a scrollable modal body, so a long history scrolls
  while the header and the **Close** button stay in place.
- It is a `role="dialog"` with `aria-modal="true"`, labelled by its **Version History** heading.
  Opening it moves the focus to its close button and keeps the focus inside; `Escape`, the **×**, the
  footer **Close** button, and a click on the backdrop close it and return the focus to the **Version
  History** button in the About dialog. While it is open, the About dialog behind it takes neither
  the keyboard nor the focus, so the first `Escape` closes only the history.
- Both colour modes are covered: the dialog is Tabler's own modal and the few extra rules use Tabler
  custom properties only.

## The stored history

`shared/release-history.json` is the single source of truth. It is a plain array of entries:

```json
[
  {
    "version": "0.21.0",
    "date": "2026-09-22",
    "changes": ["Added ...", "Improved ..."]
  }
]
```

- `version` is a stable `MAJOR.MINOR.PATCH` number, `date` an optional `YYYY-MM-DD` day, and
  `changes` at least one concise, user-facing sentence. Raw commit messages are not copied into it.
- The existing entries were reconstructed from the repository's release tags and the records in
  `docs/changes/`.
- A release is added to the file in the same change that raises the version, before the tag is
  created.

`shared/releaseHistory.js` is the one reader both the interface and the release pipeline use. It
drops anything unusable instead of failing: a non-object entry, an invalid version, an entry without
a usable change, and a duplicate version are ignored, and an unusable date only costs that entry its
date. A history file that is empty or not an array leaves the dialog with a plain *No release history
is available in this build.*

## Release pipeline integration

`scripts/release-notes.mjs <tag>` prints the user-facing notes of a tag from the same file:

```text
## What's new in 0.21.0

- Added ...
- Improved ...
```

`.github/workflows/release.yml` runs it twice. The validation job runs it next to the version
validator, so a tag whose version has no valid entry fails the release before anything is published.
The publishing job writes its output to `release-notes.md`, appends the deployment line about the
Docker image and the Proxmox source archive, and passes the file to `gh release create --notes-file`.
GitHub's generated commit list is no longer used, so the bullets a user reads in the application and
on the release page are maintained once.

## Implementation overview

- `shared/release-history.json` — the stored releases.
- `shared/releaseHistory.js` — the format: normalization, newest-first ordering, lookup by version,
  and the Markdown of a release note.
- `client/src/releaseHistory.js` — bundles the file into the client through one import; nothing in
  the interface reads the API or GitHub for the history.
- `client/src/components/VersionHistoryDialog.vue` — the dialog: the timeline, the installed marker,
  the scroll container, the `Escape` handler, focus containment, and focus restore.
- `client/src/about.js` — adds the shared `versionHistoryOpen` state next to `aboutOpen`.
- `client/src/components/AboutDialog.vue` — adds the **Version History** button and steps aside while
  the history is open, so the About shell stays small.
- `client/src/App.vue` — renders one instance for the whole shell.
- `client/src/style.css` — the layer above Bootstrap's modal and the few timeline rules.
- `scripts/release-notes.mjs` — the release notes of a tag, and a clear failure without an entry.

The [What's New dialog](whats-new-after-update.md) reads the same entries through `releasesSince()`
and opens this dialog from its **View full changelog** action.

## Verification

- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass.
- `test/releaseHistory.test.js` covers the stored file describing the running version, newest-first
  ordering independent of file order, malformed and duplicate entries being dropped without a crash,
  an unusable date losing only the date, the generated Markdown, and the script failing for a tag
  with no entry.
- `test/release.test.js` covers the workflow validating the entry and publishing with
  `--notes-file` instead of generated commit notes.
- `test/e2e/version-history.spec.js` covers opening the timeline from About, the newest-first order,
  the single **Installed** marker matching the version About reports, a known release with its
  changes, scrolling a long history, `Escape` closing only the history and restoring the focus, the
  **Close** button, opening the timeline with every request refused, and the dark colour mode.
- `test/e2e/about.spec.js` covers the **Version History** action being present in About.
- The dialog was inspected in Chromium in both colour modes.

## Notes and limitations

- The history is a bundled snapshot: an installation shows the releases known when its build was
  made, and nothing is fetched at runtime. Releases published later appear after an update.
- Only stable releases with reconstructable user-facing information are listed; the history starts at
  `0.5.0`.
- There is no filtering, search, or link to the GitHub release page of an individual entry.
