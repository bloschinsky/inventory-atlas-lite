# TASK: What's New Modal After Application Update

## Goal

Add a one-time **What's New** modal that is shown on the first application launch after the installed Inventory Atlas Lite version changes.

The modal must summarize the features/changes introduced since the last version the user has already seen.

Reuse the existing application version and changelog/release metadata. Do not create a second independent changelog source.

---

## Scope

Frontend-focused task.

No database migration is required.

No backend changes should be introduced unless strictly necessary to reuse an existing version/changelog source.

---

## Functional Requirements

### 1. Track the last version seen by the user

Store the last acknowledged application version in client-side storage.

Recommended key:

```text
inventoryAtlas.lastSeenVersion
```

Use `localStorage` unless the current project already has a more appropriate persistent client settings abstraction.

Example:

```text
lastSeenVersion = 0.17.0
currentVersion = 0.18.0
```

If the versions differ and this is not a fresh installation, show the What's New modal.

After the user closes/acknowledges the modal, save:

```text
inventoryAtlas.lastSeenVersion = currentVersion
```

The modal must not be shown again for the same version.

---

### 2. Fresh installation behavior

If no `lastSeenVersion` exists and there is no evidence that the user previously ran an older version:

- do NOT show an "Updated" / "What's New" modal;
- initialize `lastSeenVersion` with the current application version.

A fresh install must not be treated as an application update.

Do not implement a separate Welcome/Onboarding modal in this task.

---

### 3. Detect updates by comparing versions

Do not depend on the application's updater event or installation method.

The feature must work regardless of whether the application was updated through:

- Electron auto-update;
- manual installer replacement;
- portable build replacement;
- Docker image update;
- Git/manual deployment;
- another supported distribution method.

At application startup compare:

```text
lastSeenVersion
currentVersion
```

Use proper semantic version comparison. Do not compare version strings lexicographically.

---

### 4. Support skipped versions

If the user updates across multiple releases, show all relevant changes.

Example:

```text
lastSeenVersion = 0.15.0
currentVersion = 0.18.0
```

The modal should include changelog entries for:

```text
0.16.x
0.17.x
0.18.x
```

Include all versions satisfying:

```text
lastSeenVersion < releaseVersion <= currentVersion
```

Order entries newest first unless the existing changelog UI uses another consistent ordering.

---

### 5. Reuse existing changelog data

The application already has About / Changelog functionality.

The What's New modal must consume the same changelog/release metadata used there.

Target architecture:

```text
Release / Changelog Data
        |
        +--> About -> Changelog
        |
        +--> What's New Modal
```

Do not duplicate release descriptions in a second hardcoded structure.

If the existing changelog is currently embedded directly inside a component, refactor it into a reusable data/service/module first.

The refactor must not change current About / Changelog behavior.

---

### 6. What's New modal

Create a modal visually consistent with the existing About dialog and current Tabler UI.

Suggested content:

```text
Inventory Atlas Lite updated to v0.18.0

What's New

v0.18.0
- Feature A
- Feature B

v0.17.0
- Feature C

[View Full Changelog]    [Got It]
```

Requirements:

- display current application version;
- display relevant release changes;
- support one or multiple release sections;
- use existing project modal/dialog components and Tabler styles;
- be responsive and usable on desktop and mobile;
- support scrolling when the changelog content is long;
- do not block normal application startup beyond displaying the modal.

---

### 7. Modal actions

#### Got It / Close

Closing or acknowledging the modal must:

1. save `currentVersion` as `lastSeenVersion`;
2. close the modal;
3. prevent it from appearing again until a newer application version is detected.

The close icon, Escape key, backdrop close, and explicit confirmation button should behave consistently.

If the modal can be dismissed in multiple ways, all valid dismissal paths must update `lastSeenVersion`.

#### View Full Changelog

Add a button/link that opens the existing full changelog view.

Reuse the current About / Changelog navigation pattern.

Do not duplicate a second full changelog page.

---

## Version Comparison

Use an existing semver dependency if one is already present in the project.

If not, add the smallest reasonable solution for semantic version comparison.

Handle common project version formats such as:

```text
0.18.0
v0.18.0
0.18.1
1.0.0
```

Normalize an optional leading `v` before comparison if required.

Unexpected or malformed stored values must fail safely.

Recommended fallback:

- if `lastSeenVersion` is malformed, initialize it to the current version;
- do not repeatedly show the modal on every launch because of invalid stored state.

---

## Changelog Data Requirements

Each release entry used by the feature should expose at minimum:

```ts
{
  version: string
  changes: string[]
}
```

Reuse richer existing fields if they already exist.

Optional existing fields such as:

- release date;
- categories;
- type (`feature`, `fix`, `improvement`);
- title;
- links;

may be rendered if useful, but do not expand the scope unnecessarily.

---

## Suggested Structure

Names may be adapted to the existing codebase.

```text
src/
  components/
    WhatsNewModal.vue

  composables/ or services/
    useWhatsNew.ts

  data/ or services/
    changelog.ts
```

Responsibilities:

### `WhatsNewModal.vue`

Presentation only:

- current version;
- relevant releases;
- buttons;
- modal UX.

### `useWhatsNew` / service

Business logic:

- read current version;
- read `lastSeenVersion`;
- compare versions;
- select relevant changelog entries;
- determine whether modal should open;
- persist acknowledgement.

### shared changelog source

Used by both:

- About / Changelog;
- What's New modal.

Follow the project's existing architecture and conventions rather than forcing these exact filenames.

---

## Startup Integration

Run the check only after the application has enough initialization completed to know:

- current application version;
- existing changelog data;
- whether the app is in a usable state.

Do not introduce noticeable startup delays.

Do not show the modal during tests, development hot reload loops, or transient reloads in a way that causes repeated interruptions.

Development behavior may use the same version logic, but once the version is acknowledged it must remain dismissed.

---

## Localization

If the application's i18n feature is already available when this task is implemented, all new user-facing strings must use the existing localization system.

At minimum prepare keys equivalent to:

```text
whatsNew.title
whatsNew.updatedTo
whatsNew.viewChangelog
whatsNew.gotIt
```

Do not hardcode English strings if the surrounding UI already uses i18n.

---

## Edge Cases

Handle the following cases:

1. Fresh install -> no modal.
2. Same version as `lastSeenVersion` -> no modal.
3. One-version update -> show that release.
4. Multi-version update -> show all unseen releases.
5. Stored version newer than current version, e.g. downgrade -> do not show an update modal.
6. Invalid stored version -> recover safely and avoid repeated modal spam.
7. Changelog contains no matching entry for the current version -> avoid an empty broken modal.
8. `localStorage` unavailable or throws -> application must continue working normally.
9. Modal dismissed through any supported close mechanism -> acknowledgement must persist.

For case 7, preferred behavior:

- do not show an empty modal;
- log a non-fatal development warning if appropriate;
- update `lastSeenVersion` to avoid repeated attempts.

---

## Non-Goals

Do NOT implement in this task:

- Welcome / onboarding wizard;
- release notes editor;
- server-side per-user acknowledgement;
- database schema changes;
- analytics/telemetry;
- remote changelog fetching;
- update installation itself;
- notification center;
- forced acknowledgement.

---

## Acceptance Criteria

- [ ] Fresh installation does not show the What's New modal.
- [ ] First launch after an application version upgrade shows the modal exactly once.
- [ ] Relaunching the same version does not show the modal again.
- [ ] Updating across multiple versions shows all unseen changelog entries.
- [ ] The current application version is shown correctly.
- [ ] The modal uses the same changelog source as About / Changelog.
- [ ] No duplicate release metadata is introduced.
- [ ] "View Full Changelog" opens the existing changelog UI.
- [ ] Every supported dismissal path persists the current version as seen.
- [ ] Semantic version comparison is used.
- [ ] Downgrades do not incorrectly trigger an update modal.
- [ ] Invalid stored version values recover safely.
- [ ] Missing changelog entries do not create an empty/broken modal.
- [ ] Failure to access localStorage does not break application startup.
- [ ] UI is consistent with existing Tabler/About dialogs.
- [ ] Modal is usable on desktop and mobile.
- [ ] Existing About / Changelog behavior remains unchanged.

---

## Tests

Add/update tests covering at least:

```text
no stored version + fresh install -> no modal
same version -> no modal
0.17.0 -> 0.18.0 -> modal with 0.18.0
0.15.0 -> 0.18.0 -> modal with 0.16/0.17/0.18 entries
modal acknowledged -> lastSeenVersion becomes currentVersion
reload after acknowledgement -> no modal
stored version > current version -> no modal
invalid stored version -> safe fallback
missing changelog entry -> no broken modal
storage error -> application still starts
```

Use the project's existing test stack and conventions.

---

## Definition of Done

The task is complete when Inventory Atlas Lite automatically detects the first launch after an upgrade, shows a one-time What's New modal containing all unseen release notes from the shared changelog source, persists acknowledgement locally, and does not repeatedly interrupt the user on subsequent launches.
