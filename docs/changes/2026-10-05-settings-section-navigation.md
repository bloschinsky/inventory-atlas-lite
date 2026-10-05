# Section-based Settings center

- **Completed:** 2026-10-05
- **Version:** 0.51.0

## Summary

Implemented GitHub issue #4, *TASK: Reorganize Settings into a Scalable Section-Based Settings
Center*. Settings is no longer one long page; see `docs/features/settings-center.md`.

- **Routes:** `/settings` is the shell with one child route per section — `/settings/interface`,
  `/settings/database`, `/settings/cloud-backup`, and `/settings/ai`. `/settings` and unknown
  sections redirect to `/settings/interface`. The main Settings navigation entry stays active on every
  `/settings/*` address through a `/settings` prefix in `client/src/navigation.js`.
- **Information architecture:** `client/src/settingsSections.js` defines the groups *General*
  (Interface), *Data* (Database, Cloud Backup), and *Services* (AI); the routes, the desktop list, and
  the phone selector are built from it.
- **Shell:** `client/src/pages/Settings.vue` renders the page header, a Tabler
  `list-group-transparent` section list with `subheader` group titles in a labelled `<nav>` on `lg`
  and wider screens, a native grouped **Section** selector below `lg`, and the active section.
- **Sections:** `client/src/components/settings/` now holds `InterfaceSettings.vue` (new),
  `AiSettings.vue` (the AI form and state moved out of `Settings.vue`, split into Features,
  Connection, and Model cards in one form with one Save), and the moved `DatabaseSettings.vue`,
  `CloudBackupSettings.vue`, and `CloudAppCredentials.vue`.
- **OAuth:** the cloud backup callback now redirects to `/settings/cloud-backup?cloud=…`; the Data /
  Backup link points to the same section. Nothing else in the API or storage changed.
- **i18n:** new `settings.sections`, `settings.section`, `settings.groups.*`, and
  `settings.ai.featuresTitle`/`connectionTitle`/`modelTitle` in English and Ukrainian.
- **Documentation:** new `docs/features/settings-center.md` and its index entry; updated
  `docs/HOW-TO.md` (new *Find a setting* section and section paths), the AI providers, AI
  visibility, cloud backup, database metadata, interface localization, and application UI feature
  documents, `AGENTS.md`, and the release history. The task was tracked as a GitHub issue, so there
  was no `docs/issues/` file to remove.

## Verification

- `npm run lint` — passed.
- `npm test` — 266 tests: 265 passed, 1 skipped (shellcheck is not installed locally); includes the updated OAuth redirect
  assertions in `test/cloud-backup.test.js` and English/Ukrainian locale parity.
- `npm run build` — passed.
- `npm run test:e2e` (with `APP_VERSION=0.51.0`) — 134 passed. The new
  `test/e2e/settings-navigation.spec.js` covers the redirects, direct loading and reload of every
  section, the active state in both navigations, the grouped desktop list, and the phone selector by
  pointer and keyboard. The i18n, database metadata, cloud backup, and AI specs open their own
  section, and the AI visibility spec reaches AI from the main navigation through the section list.
- Checked screenshots of the AI section on a desktop in light mode, the Database section in dark
  mode, and the Cloud Backup section at phone width.
