# Task: Add Version History to the About dialog

## Goal

Add a user-facing **Version History** view accessible from **About**.

The history must show Inventory Atlas Lite releases and their user-visible changes in a compact Tabler-style vertical timeline / steps layout.

The feature must work without internet access.

## UX

Add a new action to the existing About dialog:

- **GitHub repository**
- **Version History**
- existing update controls

Clicking **Version History** opens a separate, larger modal/dialog rather than expanding the current small About modal.

### Version History dialog

Display releases newest first.

Each release should show at minimum:

- version number;
- release date when known;
- short list of user-visible additions, improvements, or fixes.

Use a Tabler-compatible vertical timeline / steps presentation similar to a vertical counter.

Example structure:

```text
v0.20.0
• Added ...
• Improved ...

v0.19.0
• Added ...
• Fixed ...
```

Requirements:

- current running version should be visually identifiable;
- dialog should be scrollable for long history;
- support existing light/dark modes;
- preserve keyboard accessibility and Escape/close behavior consistent with the existing About dialog;
- do not make a network request merely to open Version History.

## Local source of truth

Create a repository-owned structured changelog file, for example:

```text
release-history.json
```

or an equivalently appropriate shared location.

Suggested schema:

```json
[
  {
    "version": "0.20.0",
    "date": "2026-09-22",
    "changes": [
      "Added ...",
      "Improved ..."
    ]
  }
]
```

Rules:

- keep entries concise and user-facing;
- do not copy raw commit messages;
- do not invent release changes;
- derive existing entries from release tags and the repository's `docs/changes/` records;
- sort newest first in the UI regardless of storage order;
- malformed history data must not crash the About dialog.

Populate the history for the existing stable releases for which reliable user-facing change information can be reconstructed from repository documentation/history.

Patch-only technical releases may have a short fix entry instead of artificial feature text.

## Offline-first behavior

Version History must be bundled with the application.

Do not fetch GitHub Releases when the user opens the history.

The application must be able to display the installed release history on an isolated LAN with no internet connection.

## Release pipeline integration

Where practical, make the structured release history the source of user-facing release notes for future tagged releases.

The release workflow may continue to add technical deployment information such as Docker image / Proxmox assets, but user-facing change bullets should come from the same structured release-history entry instead of being maintained twice.

If CI integration would require disproportionate changes, keep it as a small isolated helper/script rather than coupling UI code to GitHub Actions.

A release/tag whose version has no valid release-history entry should fail clearly or fall back explicitly according to the repository's existing release conventions; do not silently publish misleading notes.

## Components

Prefer keeping the About shell small.

Suggested separation:

- existing `AboutDialog.vue`;
- new `VersionHistoryDialog.vue` or equivalent;
- structured release-history data in a shared/static source.

Do not put a large changelog implementation directly inside `AboutDialog.vue`.

## Tests

Add/update tests covering at least:

1. About contains a **Version History** action.
2. Opening it displays known release entries.
3. Entries render newest first.
4. Current application version is identified.
5. The dialog works without GitHub/network access.
6. Long history is scrollable.
7. Escape and close controls work.
8. Light and dark themes remain readable.
9. Invalid/missing optional release metadata does not crash the application.
10. If release pipeline integration is added, validate generation of release notes from the structured source.

## Documentation

Update:

- About feature documentation;
- feature index;
- HOW-TO if appropriate;
- release pipeline documentation if the pipeline begins consuming the structured history.

Follow `AGENTS.md` documentation conventions.

## Out of scope

- automatic migration from GitHub Releases at runtime;
- displaying every commit;
- issue/PR history;
- remote changelog editing;
- analytics or update telemetry.
