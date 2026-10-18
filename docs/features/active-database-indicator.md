# Active database indicator and instance label

## Summary

The application chrome always names the SQLite database the server has open, so two instances with
an identical interface — a test and a production container, for example — can be told apart at a
glance. An operator can also give the running instance an optional label, such as `TEST` or `PROD`,
through the `ATLAS_INSTANCE_LABEL` environment variable; it is shown beside the database name. The
name comes from the existing [database metadata](database-metadata.md); the label belongs to the
deployment and never to the database, so it does not travel with backups, restores, or copied files.

## User-visible behaviour

- **Desktop** (from the Tabler `lg` breakpoint): a single quiet line above every page, beside the
  folded sidebar rail, shows a database icon, the database name, and the instance label when one is
  configured. It stays visible while the rail is folded and does not narrow the fluid page area.
- **Phones**: the mobile header shows the same indicator as a smaller second line under the product
  name. The header stays one row with the menu button and the color-mode switch.
- Clicking or tapping the indicator (or pressing Enter on it) opens the existing
  **Settings → Database** dialog (`/settings/database`) over the current page. Closing the dialog
  returns to that page exactly as it was, with the usual unsaved-changes prompt.
- Long names are cut with an ellipsis; the link's `title` tooltip carries the full name, the instance
  label, and *Open database settings*. Its accessible name is *Active database: &lt;name&gt;*, followed
  by *Instance: &lt;label&gt;* when a label is set. The name and the label are shown as text exactly as
  stored, never translated and never interpreted as markup.
- While the metadata loads, the line says *Loading database…*; if it cannot be loaded, *Database
  unavailable*. Neither state blocks the page, and neither shows an unconfirmed name.
- Saving a new name in **Settings → Database** updates the indicator at once, without a reload. A
  name the server refuses leaves the indicator on the saved name.
- A restore or a reset first drops the old name, then shows the name of the database that is now
  open as soon as the server is ready, before the page reloads itself. In the public demo, **Reset
  demo** and a language change seed the in-browser database again, and the indicator follows.
- Without `ATLAS_INSTANCE_LABEL` the indicator shows only the database name.

## Instance label

- Set `ATLAS_INSTANCE_LABEL` in the server's environment (see the README for Docker and manual runs,
  and `docs/proxmox.md` for the Proxmox environment file). It is read once at startup.
- `server/src/instanceLabel.js` normalizes it: control, formatting, and line-separator characters
  become spaces, whitespace is collapsed and trimmed, and the text is cut to 24 characters. A missing
  or blank value means no label. A bad value never stops the server.
- `GET /api/capabilities` returns it as `instanceLabel` (a string or `null`). No other environment
  value is exposed.
- It is shown as a neutral, outlined badge whose text carries the meaning; the application never
  infers an environment from it and gives it no colors of its own.
- It is informational only: it does not change which database is open, backups, restores, resets, or
  any other behavior. It is not stored in SQLite, so restoring a database named *PROD* on an instance
  labeled `TEST` still shows `TEST`.

## Implementation

- `client/src/activeDatabase.js` is the shared reactive metadata of the active database, in the
  style of `capabilities.js`: `loadActiveDatabase()` (with `replaced: true` after the database itself
  changed), `forgetActiveDatabase()`, and `renameActiveDatabase()`. A newer request always wins over
  an older one still in flight, and a failed load leaves no name.
- `client/src/components/ActiveDatabaseIndicator.vue` renders the link; `App.vue` places it in a
  desktop-only line above the page and loads the metadata at startup and after every demo reset
  (`dataRevision`), and `AppMobileNav.vue` places it under the product name.
- `client/src/components/settings/DatabaseSettings.vue` loads and renames through the shared state
  instead of its own requests; `client/src/pages/DataBackup.vue` forgets and reloads it after a
  restore or reset.
- The label reaches the client through `client/src/capabilities.js` (`capabilities.instanceLabel`).
- No schema, metadata, or API shape changed apart from the new `instanceLabel` capability.

## Tests

- `test/instance-label.test.js`: normalization (blank, control characters, markup kept as text, the
  length limit by characters), the capabilities response, and a real server started with
  `ATLAS_INSTANCE_LABEL` that keeps its label after restoring a database named *PROD*, while the same
  data directory under a server without the variable shows none.
- `test/e2e/database-indicator.spec.js`: the name on several pages beside the folded rail, keyboard
  activation of Settings → Database and the return to the covered page, immediate rename and a refused
  rename, long names and labels with markup on desktop and at 320px, the label as text, a restore
  that shows the restored name before and after the reload with the instance label unchanged, the
  unavailable state, the phone header, and the Ukrainian dark mode.
- `test/e2e/reset.spec.js` checks the default name after a reset, and `test/e2e/demo.spec.js` the
  demo's database name and its refresh after a language change.
