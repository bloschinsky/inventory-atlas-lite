# Settings center

## Summary

**Settings** is a section-based settings center that opens as a route-driven dialog over the page the
user is working on, instead of replacing it. Every section has its own address, only the chosen
section is rendered, and the sections are grouped so new ones can be added without redesigning it:

| Group | Section | Address |
| --- | --- | --- |
| General | Interface | `/settings/interface` |
| Data | Database | `/settings/database` |
| Data | Cloud Backup | `/settings/cloud-backup` |
| Services | AI | `/settings/ai` |

The behaviour, validation, and persistence of every setting are unchanged; the dialog is built only
from installed Tabler modal markup and the existing Vue Router, without a modal or state library.

## User-visible behaviour

- `/settings` redirects to `/settings/interface`, and an unknown `/settings/<name>` redirects there
  too. Every section address works when opened directly and after a reload.
- **Opening:** the main **Settings** entry (sidebar or phone drawer) and any in-app link to a section,
  such as **Cloud Backup in Settings** on **Data / Backup**, navigate to the section address. The page
  that was shown stays rendered underneath — the same component instance with its search, filters,
  selection, and scroll position — behind the Tabler `modal-blur` backdrop, and is `inert` and
  `aria-hidden`, so it cannot be clicked, tabbed into, or read. The phone drawer closes first.
- **Direct addresses:** a section address loaded directly — a bookmark, a reload, or the cloud OAuth
  return — has no page of its own to cover, so the dialog opens over the **Dashboard**.
- **Sections:** the section list and the phone selector *replace* the address, so the URL and the
  content change without closing the dialog, without touching the page underneath, and without adding
  history entries.
- **Closing:** the close button, `Escape`, and a click on the backdrop close the dialog. When the
  covered page is the previous history entry the dialog goes Back to it, so the history does not keep
  the Settings entry; otherwise it navigates to the covered page. A directly loaded address is
  *replaced* by `/dashboard`, so Back never reopens Settings over a page it was not opened from.
  Browser Back and Forward close and reopen the dialog over the page it was opened from, and any other
  navigation from Settings leaves no dialog, backdrop, scroll lock, or focus trap behind.
- **Unsaved changes:** the AI form, the cloud backup schedule, a provider's app credentials, and the
  database name compare their fields with the last loaded or saved values. While any of them differs,
  closing, another section, Back, or any other navigation asks *Discard the unsaved changes in
  Settings?*; **Cancel** keeps the dialog, the section, and the edit. Nothing is asked when nothing
  changed or after a successful save, and a query-only change, such as clearing the OAuth result, is
  never blocked. Leaving for the Dropbox or Google Drive sign-in is a full-page navigation and is not
  blocked either.
- **Accessibility:** the dialog has `role="dialog"`, `aria-modal="true"`, and the *Settings* `h1` as
  its label. The focus moves to the close button on open, `Tab` and `Shift+Tab` wrap inside the
  dialog, and the focus returns to the opener when it still exists. About, Version History, and
  What's New open above Settings; while one of them is up it owns `Escape` and the focus, and Settings
  takes the focus back when it closes. There is no open or close animation.
- The main **Settings** navigation entry stays active (`aria-current="page"`) on every `/settings/*`
  address.
- **Desktops and tablets (`md`, 768px and wider):** a centered dialog up to `57.5rem` (920px) wide,
  never wider than the viewport, and `min(88dvh, viewport − margins)` high. The header holds the
  Settings icon and title and the close button. A `14rem` column on the left lists the sections in a
  `<nav>` labelled *Settings sections*. Each group has a Tabler `subheader` heading (*General*, *Data*,
  *Services*) and its sections are Tabler `list-group-transparent` links with an icon and a label. The
  active section has the Tabler active background, bold text, and `aria-current="page"`, so the state
  does not rely on color. Only the section pane scrolls, so the header and the list stay in place; each
  section starts at its top, and the page behind never scrolls.
- **Phones (below 768px):** the dialog fills the screen (`modal-fullscreen-md-down`) and the side list
  is hidden. A native **Section** selector at the top of the pane lists every section under its group
  (`<optgroup>`), shows the current one, and opens a section on change. It needs no horizontal
  scrolling, works from the keyboard, and grows with the sections. The pane leaves room for the bottom
  safe area.
- **Interface** and **Database** are one card each. **Cloud Backup** keeps its existing card.
- **AI** has an *AI* heading and three cards in one form: **Features** (*Enable AI features*),
  **Connection** (provider, display name, base URL, API key, *Remove the saved API key*, *Test
  connection*), and **Model** (the grouped model list with *Show all models* and *Refresh models*,
  custom model ID, *Image input*). One
  **Save settings** button below the cards saves them together, exactly as before.
- After a Dropbox or Google Drive sign-in, the server returns the browser to
  `/settings/cloud-backup?cloud=connected&provider=…` or `/settings/cloud-backup?cloud=error`. The
  Cloud Backup section shows the same notice or error as before and clears the query.
- The **Cloud Backup in Settings** link on **Data / Backup** opens `/settings/cloud-backup` over the
  Data / Backup page.
- The public demo uses the same dialog with its hash addresses (`#/settings/<section>`); its
  server-only sections still show *Not available in the public demo*.

## Implementation

- `client/src/settingsSections.js` is the single source of truth: the groups, and for each section
  its path, label key, Tabler icon, and component. The router children, the desktop list, and the
  phone selector are all built from it, so a new section is one entry and one component.
- `client/src/main.js` registers `/settings` with `pages/Settings.vue` as the shell and one child
  route per section, plus the default and unknown-section redirects, and installs the overlay guards.
- `client/src/settingsOverlay.js` holds the dialog's routing state: `isSettingsRoute()`; the
  background route, recorded by an `afterEach` hook from the route a Settings address was entered
  from and cleared on any other route; `usePageRoute()`, the route the page area shows (the current
  route, or the background or the Dashboard under Settings, kept as the same object while its address
  does not change); `closeSettings()`; and `useUnsavedChanges()`, which registers a form's check for
  the `beforeEach` discard prompt.
- `client/src/App.vue` renders the page area through `components/PageView.vue` with that route and
  renders a second `<RouterView>` for the Settings dialog only on a Settings address, outside the
  `inert` page. `PageView.vue` passes the route to its `<RouterView>` and provides it to
  `useRoute()`, so the page underneath keeps reading its own address and never reloads.
- `client/src/pages/Settings.vue` is the dialog: the Tabler modal markup, the header, the local
  navigation, the phone selector, and the `<RouterView>` of the active section, with the scroll lock
  (`modal-open`), `Escape`, the focus trap, and focus restoration. The active section is matched by
  the route record path, so a query such as the OAuth result does not affect it.
- `AboutDialog.vue` and `WhatsNewDialog.vue` keep the page scroll locked when they close over the
  Settings dialog.
- `client/src/components/settings/` holds one component per section: `InterfaceSettings.vue`,
  `DatabaseSettings.vue`, `CloudBackupSettings.vue` (with its `CloudAppCredentials.vue`), and
  `AiSettings.vue`, which now owns the AI form state and behaviour moved out of `Settings.vue`. The
  database and cloud backup components were moved, not rewritten.
- `client/src/navigation.js` gives the Settings entry the `/settings` prefix.
- `server/src/routes/cloudBackupRoutes.js` redirects the OAuth callback to the Cloud Backup section.
  The OAuth protocol, providers, credential handling, and security model are unchanged.
- `client/src/style.css` sizes the dialog (`.app-settings-dialog`), the section list
  (`.app-settings-nav`), and the scrolling pane (`.app-settings-pane`), places the dialog below the
  default modal layer so About and What's New stack above it, and adds `body.modal-open` as the scroll
  lock. Colors come only from Tabler tokens, so both color modes stay correct.
- `settings.close` (*Close settings*) and `settings.discardChanges` replaced the page subtitle
  `settings.subtitle`.
- New translation keys in English and Ukrainian: `settings.sections`, `settings.section`,
  `settings.groups.general`/`data`/`services`, and `settings.ai.featuresTitle`/`connectionTitle`/
  `modelTitle`.

## Boundaries

- No setting, API, or storage format changed, apart from the OAuth return address.
- The dialog keeps no page cache: only the one covered page stays rendered, and a page is never
  rendered twice.
- Unsaved Settings edits are not protected against closing the browser tab or a reload.

## Tests

- `test/e2e/settings-navigation.spec.js`: the `/settings` and unknown-section redirects, direct
  loading and reload of every section over the Dashboard with only that section rendered, the active
  state in the local list and the main navigation, and closing to the Dashboard; opening over Items
  with the search, scroll position, and page instance kept, the dialog size and semantics, the grouped
  list, section changes without history entries, scrolling inside the pane, the focus trap, closing
  back to Items, and focus restoration; `Escape`, Back, and Forward over Hierarchy and Templates
  without stale overlays; the Data / Backup link; the unsaved-changes prompt on a section change,
  close, `Escape`, and Back, with no prompt after a save or an undone edit; the full-screen phone
  dialog opened from the drawer with the selector by pointer and keyboard and a reachable last
  button; and the dark mode in Ukrainian.
- `navigation.spec.js` opens Settings from Data / Backup and closes back to it; `ai-visibility.spec.js`
  closes Settings (confirming an unsaved discard) before going to Items; `demo.spec.js` and
  `tour.spec.js` close it after the demo language change.
- The existing Settings specs open their own section: `i18n.spec.js` (`/settings/interface`),
  `database-metadata.spec.js` (`/settings/database`), `cloud-backup.spec.js`
  (`/settings/cloud-backup`, including the OAuth return address), and `ai-add-item.spec.js`,
  `ai-providers.spec.js`, and `ai-visibility.spec.js` (`/settings/ai`, reached from the main
  navigation through the local list).
- `test/cloud-backup.test.js` checks the new OAuth redirect targets.
