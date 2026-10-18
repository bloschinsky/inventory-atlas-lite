# Active database indicator and optional instance label

- Completed: 2026-10-18
- Version: 0.66.0
- Task: GitHub issue #41

## Summary

The application chrome now always names the database the server has open, and an operator can label
the running instance with `ATLAS_INSTANCE_LABEL`. See `docs/features/active-database-indicator.md`.

- **Indicator:** `ActiveDatabaseIndicator.vue` is a link to the existing Settings → Database dialog
  (`/settings/database`) with a database icon, the name as text, and the label as a neutral outlined
  badge. `App.vue` shows it in a single desktop-only line above the page, beside the folded rail;
  `AppMobileNav.vue` shows it as a smaller second line under the product name, and the header row no
  longer wraps the color-mode switch at 375px. Long names are cut with an ellipsis and disclosed by
  the `title` tooltip; visually hidden *Active database:* and *Instance:* prefixes give the accessible
  name. Loading and failure states (*Loading database…*, *Database unavailable*) never show an
  unconfirmed name.
- **Shared metadata:** `client/src/activeDatabase.js` holds the metadata of the open database.
  Settings → Database now loads and renames through it, so a saved name updates the indicator at once
  and a refused one leaves it alone; the latest request wins. The restore and reset flows forget the
  old name immediately and load the new one once the server is ready, before the page reloads. In the
  demo, every `dataRevision` change (Reset demo, a language change) loads it again.
- **Instance label:** `server/src/instanceLabel.js` normalizes `ATLAS_INSTANCE_LABEL` (control and
  formatting characters to spaces, collapsed whitespace, at most 24 characters, blank means none);
  `index.js` passes it to `createApp()`, and `/api/capabilities` returns it as `instanceLabel`
  (`null` without one). It is never stored in SQLite, so backups and restores do not carry it, and it
  changes no behavior.
- No schema, migration, or metadata change; `GET/PUT /api/database/metadata` are unchanged.
- Documentation: the new feature document and its index entry, `database-metadata.md`,
  `application-ui.md`, the user guide in both languages (*Name the database*), the README (Docker
  and manual runs), `docs/proxmox.md` (the environment file), and `AGENTS.md`.

## Verification

- `npm run lint`: passed.
- `npm test`: 390 of 393 passed (one skipped), including the new `test/instance-label.test.js` and the updated
  capabilities expectations in `test/e2e.test.js`. The two failures are the guide tests in
  `test/landing.test.js` that also fail on a clean `master` on Windows.
- `npm run build`: passed.
- Playwright, targeted: `database-indicator`, `database-metadata`, `settings-navigation`, `reset`,
  `demo`, and `restore` specs all passed. New `test/e2e/database-indicator.spec.js` (8 tests);
  `reset.spec.js` and `demo.spec.js` gained indicator checks.
- Full `APP_VERSION=0.66.0 npm run test:e2e`: 258 of 258 passed.
