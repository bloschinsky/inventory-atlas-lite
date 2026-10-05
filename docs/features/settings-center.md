# Settings center

## Summary

**Settings** is a section-based settings center instead of one long page. Every section has its own
address, only the chosen section is rendered, and the sections are grouped so new ones can be added
without redesigning the page:

| Group | Section | Address |
| --- | --- | --- |
| General | Interface | `/settings/interface` |
| Data | Database | `/settings/database` |
| Data | Cloud Backup | `/settings/cloud-backup` |
| Services | AI | `/settings/ai` |

The behaviour, validation, and persistence of every setting are unchanged; this is a reorganization
of the interface, built only from installed Tabler components.

## User-visible behaviour

- `/settings` redirects to `/settings/interface`, and an unknown `/settings/<name>` redirects there
  too. Every section address works when opened directly and after a reload.
- The main **Settings** navigation entry stays active (`aria-current="page"`) on every `/settings/*`
  address.
- **Desktops (`lg`, 992px and wider):** a `16rem` column on the left lists the sections in a
  `<nav>` labelled *Settings sections*. Each group has a Tabler `subheader` heading (*General*, *Data*,
  *Services*) and its sections are Tabler `list-group-transparent` links with an icon and a label. The
  active section has the Tabler active background, bold text, and `aria-current="page"`, so the state
  does not rely on color. The column stays in view while a long section scrolls. The active section
  fills the content column, which keeps the usual form width.
- **Phones and narrow screens:** the side list is hidden. A native **Section** selector at the top of
  the content lists every section under its group (`<optgroup>`), shows the current one, and opens a
  section on change. It needs no horizontal scrolling, works from the keyboard, and grows with the
  sections.
- **Interface** and **Database** are one card each. **Cloud Backup** keeps its existing card.
- **AI** has an *AI* heading and three cards in one form: **Features** (*Enable AI features*),
  **Connection** (provider, display name, base URL, API key, *Remove the saved API key*, *Test
  connection*), and **Model** (model list with *Refresh models*, custom model ID, *Image input*). One
  **Save settings** button below the cards saves them together, exactly as before.
- After a Dropbox or Google Drive sign-in, the server returns the browser to
  `/settings/cloud-backup?cloud=connected&provider=…` or `/settings/cloud-backup?cloud=error`. The
  Cloud Backup section shows the same notice or error as before and clears the query.
- The **Cloud Backup in Settings** link on **Data / Backup** opens `/settings/cloud-backup`.

## Implementation

- `client/src/settingsSections.js` is the single source of truth: the groups, and for each section
  its path, label key, Tabler icon, and component. The router children, the desktop list, and the
  phone selector are all built from it, so a new section is one entry and one component.
- `client/src/main.js` registers `/settings` with `pages/Settings.vue` as the shell and one child
  route per section, plus the default and unknown-section redirects.
- `client/src/pages/Settings.vue` is only the shell: the page header, the local navigation, the phone
  selector, and the `<RouterView>` of the active section. The active section is matched by the route
  record path, so a query such as the OAuth result does not affect it.
- `client/src/components/settings/` holds one component per section: `InterfaceSettings.vue`,
  `DatabaseSettings.vue`, `CloudBackupSettings.vue` (with its `CloudAppCredentials.vue`), and
  `AiSettings.vue`, which now owns the AI form state and behaviour moved out of `Settings.vue`. The
  database and cloud backup components were moved, not rewritten.
- `client/src/navigation.js` gives the Settings entry the `/settings` prefix.
- `server/src/routes/cloudBackupRoutes.js` redirects the OAuth callback to the Cloud Backup section.
  The OAuth protocol, providers, credential handling, and security model are unchanged.
- `client/src/style.css` adds only `.settings-nav` (width and sticky position), without colors, so
  both color modes come from Tabler.
- New translation keys in English and Ukrainian: `settings.sections`, `settings.section`,
  `settings.groups.general`/`data`/`services`, and `settings.ai.featuresTitle`/`connectionTitle`/
  `modelTitle`.

## Boundaries

- No setting, API, or storage format changed, apart from the OAuth return address.
- The page and content width of the application are unchanged; that is a separate task.

## Tests

- `test/e2e/settings-navigation.spec.js`: the `/settings` and unknown-section redirects, direct
  loading and reload of every section with only that section rendered, the active state in the local
  list and the main navigation, the grouped desktop list, and the phone selector by pointer and
  keyboard.
- The existing Settings specs open their own section: `i18n.spec.js` (`/settings/interface`),
  `database-metadata.spec.js` (`/settings/database`), `cloud-backup.spec.js`
  (`/settings/cloud-backup`, including the OAuth return address), and `ai-add-item.spec.js`,
  `ai-providers.spec.js`, and `ai-visibility.spec.js` (`/settings/ai`, reached from the main
  navigation through the local list).
- `test/cloud-backup.test.js` checks the new OAuth redirect targets.
