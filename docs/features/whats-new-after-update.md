# What's New after update

## Summary

On the first launch after Inventory Atlas Lite was updated, a **What's New** dialog lists the
user-visible changes of every release since the version this browser last acknowledged. It is shown
once per update and reads the same bundled release history as **About** → **Version History**, so
there is no second changelog and nothing is fetched at runtime.

## User-visible behaviour

- Detection compares versions, not updater events: a Proxmox self-update, a Docker image update, a
  manual or Git deployment, or any other way of replacing the application is noticed the same way.
- The dialog states the running version (*Inventory Atlas Lite was updated to version 0.38.0.*) and
  lists every release with `lastSeen < version <= current`, newest first, each with `v<version>`, its
  date when known, and its changes. Skipped releases are all included.
- **Got it**, the **×**, `Escape`, and a click on the backdrop all close it and store the running
  version as seen; nothing is stored while it is open, so a reload before closing shows it again.
- **View full changelog** acknowledges the update, then opens the existing About dialog with Version
  History over it.
- It is a Tabler modal like About: `role="dialog"`, `aria-modal="true"`, labelled by its heading, focus
  moved to the close button and kept inside, a scrollable body with a fixed header and footer, and a
  layout that fits a phone. Both colour modes are covered by Tabler's own styles.
- Its interface text is translated (`whatsNew.*` in `en.json` and `uk.json`); the release notes stay
  in English, as in Version History.

## Decision rules

The last acknowledged version is kept in `localStorage` under `inventory-atlas.lastSeenVersion`, as a
plain `MAJOR.MINOR.PATCH`. The running version is `appInfo.version` with a `v` prefix or `-dev` suffix
removed, so a development build `0.38.0-dev` counts as `0.38.0`. Versions are compared with
`shared/semver.js`, never as strings.

| Stored value | Result |
| --- | --- |
| None (fresh installation or new browser) | No dialog; the running version is stored. |
| Same as the running version | No dialog. |
| Older, with history entries in between | The dialog, until it is closed. |
| Older, with no history entry in between | No dialog; the running version is stored and a development build logs a warning. |
| Newer (downgrade) | No dialog; the newer stored version is kept, so upgrading again does not repeat its notes. |
| Not a version | No dialog; the running version replaces it. |
| Storage unavailable or throwing | No dialog, because it could not stay dismissed; the application starts normally. |

A missing stored value is always treated as a fresh installation: the version an existing browser ran
before this feature is not known, so its first update after `0.38.0` is the first one announced.

## Implementation overview

- `shared/semver.js` — version parsing and comparison, moved from `server/src/update/` so the updater
  and the client share one implementation.
- `shared/releaseHistory.js` — adds `releasesSince()`, the releases between two versions.
- `client/src/whatsNew.js` — the storage key, `unseenReleases()` (the rules above, taking the storage
  as a parameter), the shared dialog state, the startup check, and the acknowledgement.
- `client/src/components/WhatsNewDialog.vue` — presentation, focus handling, and the two actions; it
  runs the check once when the shell mounts, without waiting for any request.
- `client/src/App.vue` — renders one instance next to About and Version History.
- `client/src/style.css` — spacing between release sections and their muted change lists.

## Verification

- `test/whatsNew.test.js` covers a fresh installation, the same version, one and several unseen
  releases, numeric rather than lexical comparison, a downgrade, invalid stored values, a missing
  history entry, blocked storage, and the running version always having notes.
- `test/e2e/whats-new.spec.js` covers no dialog on a fresh profile, a single update shown once and not
  after a reload, several skipped releases on a phone-sized scrollable dialog, `Escape` and a backdrop
  click acknowledging, **View full changelog** opening Version History over About, a downgrade and an
  invalid value, blocked storage, and the Ukrainian interface.
- Existing `about.spec.js` and `version-history.spec.js` pass unchanged: each Playwright test starts
  with an empty profile, which is a fresh installation, so the dialog never interrupts other tests.

## Notes and limitations

- Acknowledgement is per browser profile; there is no server-side or per-user record.
- There is no welcome dialog for a fresh installation.
