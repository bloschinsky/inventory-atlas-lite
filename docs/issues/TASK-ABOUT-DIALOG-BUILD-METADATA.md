# Task — About Dialog and Build Metadata

## Status
Planned.

## Dependencies
This task is intentionally independent from the Docker/Proxmox and Electron release tasks.

It may reuse the same Git tag/versioning convention, but it must not depend on those release pipelines being implemented first.

---

# Goal

Add a classic **About** section to Inventory Atlas Lite.

The About section must open as a modal/popup and display basic application/project information:

- project name;
- current version;
- build identifier;
- build/source date, when available;
- developer name;
- link to the GitHub repository.

The version/build metadata must be injected automatically during build/release and must not require manually editing the UI for every release.

---

# Target UI

Add an **About** item to an appropriate place in the application UI, for example:

```text
Settings
└── About
```

or another existing application menu/location that fits the current design.

Clicking **About** must open a modal/dialog.

Example content:

```text
Inventory Atlas Lite

Version 0.8.0
Build 71fbc82
Build date: 2026-09-19

Developed by Artem Bloschinsky

GitHub:
github.com/bloschinsky/inventory-atlas-lite
```

The exact typography/layout should follow the current Tabler-based design system.

Do not create a separate full page if a modal/dialog is sufficient.

---

# 1. Project information

The About dialog must include:

```text
Project name:
Inventory Atlas Lite

Developer:
Artem Bloschinsky

Repository:
https://github.com/bloschinsky/inventory-atlas-lite
```

The GitHub repository must be shown as a clickable link.

Open external links in a safe/new browser context appropriate for the current runtime.

---

# 2. Version source

The application version must be derived automatically from the Git release tag when one exists.

For example:

```text
Git tag:
v0.8.0
```

must be exposed in the application as:

```text
Version:
0.8.0
```

Do not require manually changing the visible version in a Vue component for every release.

Recommended priority:

```text
1. Explicit build environment variable generated from Git tag
2. package.json version as fallback
3. development marker when neither is available
```

Example development fallback:

```text
Version: dev
```

or:

```text
Version: 0.8.0-dev
```

Use whichever integrates more cleanly with the existing project.

---

# 3. Build identifier

Use the Git commit as the build identifier.

Recommended format:

```text
Build:
71fbc82
```

where the value is the short commit SHA.

This value must be injected automatically at build time.

Do not maintain an independent manually incremented build number.

The build identifier should be traceable back to the exact source revision used to create the application.

---

# 4. Build/source date

Display a date only if it can be obtained reliably.

Preferred source:

```text
Git commit timestamp
```

rather than the local clock time of the machine running `npm build`.

Reason:

- commit date is deterministic;
- repeated builds of the same commit show the same source date;
- it better identifies the exact source revision.

Preferred display:

```text
Build date:
2026-09-19
```

or, if time is useful:

```text
Build date:
2026-09-19 12:42 UTC
```

Keep the user-facing format simple.

If no reliable Git timestamp is available in a development/source-less environment, either omit the field or show:

```text
Build date: unavailable
```

Do not invent a date.

---

# 5. Build metadata injection

Create a small central build metadata mechanism instead of reading Git directly from Vue runtime code.

Conceptually:

```text
Git
 │
 ├── tag
 ├── commit SHA
 └── commit date
       │
       ▼
build step
       │
       ▼
generated/injected metadata
       │
       ▼
Vue About dialog
```

A suitable implementation may use:

```text
VITE_APP_VERSION
VITE_APP_BUILD
VITE_APP_BUILD_DATE
```

or a generated module such as:

```text
src/generated/build-info.ts
```

Choose the implementation that best fits the current project architecture.

The frontend must consume one central metadata source.

Avoid duplicated constants in multiple components.

---

# 6. Local development behavior

The application must remain easy to run using the normal development commands.

Example development values:

```text
Version: dev
Build: 71fbc82
Build date: 2026-09-19
```

If Git metadata can be resolved locally, use it.

If not, graceful fallback values are acceptable.

The About dialog must never fail to open because Git metadata is unavailable.

---

# 7. Tagged build behavior

When the application is built from:

```text
v0.8.0
```

at commit:

```text
71fbc82...
```

the About dialog must show approximately:

```text
Inventory Atlas Lite

Version 0.8.0
Build 71fbc82
Build date: 2026-09-19

Developed by Artem Bloschinsky

GitHub
https://github.com/bloschinsky/inventory-atlas-lite
```

The exact values must correspond to the tag/commit used for that build.

---

# 8. Compatibility with future release pipelines

This task must work independently, but its metadata mechanism should be easy to feed from future GitHub Actions workflows.

The expected future integration is:

```text
Git tag
  ↓
GitHub Actions / local build
  ↓
APP_VERSION
APP_BUILD
APP_BUILD_DATE
  ↓
Inventory Atlas Lite
  ↓
About
```

Do not hard-couple the About component to:

- Docker;
- Proxmox;
- Electron;
- GitHub Actions-specific APIs.

The same metadata API should work for:

- local development;
- normal production web build;
- Docker build;
- future Electron build.

---

# 9. UI behavior

Use the existing design system and modal components.

The About dialog should feel like a classic desktop/web application About dialog.

Suggested structure:

```text
[Inventory Atlas Lite logo/icon]

Inventory Atlas Lite
Version 0.8.0
Build 71fbc82
Build date 2026-09-19

Developed by Artem Bloschinsky

GitHub repository

[Close]
```

Keep the dialog compact.

Do not overload it with:

- changelog;
- diagnostics;
- system information;
- database statistics;
- license text;
- update controls.

Those may be separate future features.

---

# 10. Optional polish

If the project logo/icon is already available, use it in the dialog.

Optional presentation details:

- application logo;
- monospace style for build SHA;
- copy-to-clipboard for version/build info;
- GitHub icon next to repository link.

These are optional and must not complicate the implementation.

---

# 11. Accessibility

The About dialog must:

- be keyboard accessible;
- close with `Esc`;
- have a visible close button;
- correctly manage focus while open;
- use accessible dialog semantics supported by the current UI library.

Prefer existing Tabler/Bootstrap modal behavior instead of implementing custom modal mechanics.

---

# 12. Out of scope

Do not implement in this task:

- auto-update;
- release downloads;
- changelog viewer;
- Docker version management;
- Electron packaging;
- Proxmox release changes;
- telemetry;
- system diagnostics;
- license-management UI.

---

# Acceptance criteria

The task is complete when all of the following are true:

- [ ] An About entry exists in the application UI.
- [ ] Clicking About opens a modal/dialog.
- [ ] The dialog displays `Inventory Atlas Lite`.
- [ ] The dialog displays developer name `Artem Bloschinsky`.
- [ ] The dialog contains a clickable link to `https://github.com/bloschinsky/inventory-atlas-lite`.
- [ ] The displayed version can be injected automatically from a Git tag/build environment.
- [ ] A tag like `v0.8.0` is displayed as version `0.8.0`.
- [ ] The build identifier is derived from the Git commit SHA.
- [ ] The short SHA is shown in the About dialog.
- [ ] Build/source date is derived from Git metadata when available.
- [ ] Missing metadata does not break local development.
- [ ] Build metadata is defined in one central place and reused by the UI.
- [ ] No version/build constants need to be edited manually for every release.
- [ ] The implementation is independent of Docker, Proxmox, and Electron.
- [ ] The dialog follows the current Tabler/Bootstrap visual style.
- [ ] The dialog is keyboard accessible.

---

# Manual verification

## Development build

Run the project normally.

Open:

```text
About
```

Confirm:

```text
Inventory Atlas Lite
Version: dev or current project version
Build: current short Git SHA
Build date: current commit date
Developer: Artem Bloschinsky
GitHub repository link
```

The dialog must open and close normally.

---

## Tagged build

Create/build from a test tag:

```text
v0.8.0
```

Verify that the application displays:

```text
Version 0.8.0
```

and that:

```text
Build
```

matches the commit referenced by the tag.

Verify that the displayed date corresponds to the source commit date.

---

# Result

Inventory Atlas Lite gets a conventional application About dialog with automatically generated build metadata:

```text
Inventory Atlas Lite
Version 0.8.0
Build 71fbc82
Build date 2026-09-19

Developed by Artem Bloschinsky
GitHub repository
```

The metadata source remains generic enough to work unchanged across web, Docker, Proxmox, and future Electron distributions.
