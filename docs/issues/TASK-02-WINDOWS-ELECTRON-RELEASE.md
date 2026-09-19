# Task 02 — Windows Desktop Distribution via Electron

## Status
Planned for later.

## Depends on
**Task 01 — GitHub Release Pipeline MVP must be completed first.**

Do not implement this task until the tag-driven GitHub Release flow from Task 01 is stable.

## Goal

Add an official Windows desktop distribution of **Inventory Atlas Lite** using Electron while keeping the same repository and the same release tag as the server builds.

For every official release tag:

```text
vX.Y.Z
```

the existing release pipeline must additionally produce:

```text
Inventory-Atlas-Lite-Setup-X.Y.Z.exe
Inventory-Atlas-Lite-Portable-X.Y.Z.exe
```

and attach both files to the same GitHub Release created by Task 01.

GitHub Releases remain the central distribution page.

---

# Target release architecture

After this task:

```text
git tag vX.Y.Z
      │
      ▼
GitHub Actions
      │
      ├── Validate
      │
      ├── Docker image -> GHCR
      │
      ├── Proxmox assets
      │
      ├── Windows Setup.exe
      │
      ├── Windows Portable.exe
      │
      └── GitHub Release
```

All artifacts must be built from the exact same Git commit referenced by the tag.

---

# Architectural principle

Do not create a separate Windows fork of Inventory Atlas Lite.

The existing Vue UI, Express backend, SQLite logic, validation rules, and application behavior should be reused as much as possible.

Target structure may look similar to:

```text
inventory-atlas-lite/
├── client/
├── server/
├── desktop/
│   ├── main.*
│   └── preload.*
├── scripts/
├── deploy/
└── package.json
```

The exact layout may differ if there is a cleaner fit with the existing repository.

---

# 1. Electron integration

Add Electron as the Windows desktop shell.

The packaged application must include everything required to run locally.

The end user must **not** need to separately install:

- Node.js;
- npm;
- Docker;
- SQLite;
- a web server;
- a browser extension;
- developer tools.

Expected UX:

```text
double-click Inventory Atlas Lite
          ↓
application window opens
          ↓
local SQLite database is available
```

---

# 2. Reuse the existing backend

Prefer reusing the existing Express backend instead of rewriting the application for the first Windows implementation.

A practical architecture is:

```text
Electron main process
      │
      ├── starts local Inventory Atlas Lite backend
      │
      ├── configures desktop DATA_DIR
      │
      └── opens BrowserWindow
                │
                └── existing Vue frontend
```

The backend must only listen locally in desktop mode.

Do not expose the Windows desktop backend to the LAN by default.

If a local TCP port is used, bind to:

```text
127.0.0.1
```

rather than:

```text
0.0.0.0
```

Prefer avoiding a hard-coded port collision where practical.

---

# 3. Desktop data directory

Desktop user data must live outside the installed application files.

Do not store the SQLite database inside:

```text
Program Files
```

or inside Electron application resources.

Use the Electron user-data/application-data location.

Expected conceptual path:

```text
%APPDATA%\Inventory Atlas Lite\
```

or an equivalent platform-appropriate Electron `userData` directory.

The desktop `DATA_DIR` should contain the SQLite database and related persistent application data.

Installing a newer application version must not replace or delete the database.

---

# 4. Setup build

Create a standard Windows installer:

```text
Inventory-Atlas-Lite-Setup-X.Y.Z.exe
```

Use an established Electron packaging tool.

**Preferred for this task:** `electron-builder`, because the required outputs map naturally to its Windows NSIS + portable targets.

If another maintained Electron packaging tool provides a clearly better implementation, it may be used, but document the reason.

The Setup build should:

- install the application;
- create normal Windows shortcuts where appropriate;
- register an uninstall entry;
- launch without requiring administrator privileges where possible;
- preserve user data across upgrades/uninstall/reinstall according to normal application expectations.

---

# 5. Portable build

Create:

```text
Inventory-Atlas-Lite-Portable-X.Y.Z.exe
```

This build must run without a traditional installation step.

"Portable" in this task means **portable executable distribution**, not necessarily that user data must live beside the `.exe`.

For consistency and safety, it is acceptable—and preferred for the MVP—for both Setup and Portable variants to use the same per-user application data directory.

Do not write the production SQLite database beside the executable by default unless there is a deliberate documented reason.

---

# 6. Native Node dependency handling

The project uses `better-sqlite3`, which contains native code.

The Windows/Electron packaging process must correctly rebuild/package the native module for the Electron runtime.

The packaged application must work on a clean supported Windows machine without requiring Visual Studio Build Tools or npm at runtime.

Add the required Electron rebuild/native dependency step to the build process.

---

# 7. Electron security defaults

Use sane Electron defaults.

At minimum:

```text
nodeIntegration = false
contextIsolation = true
```

Do not expose arbitrary Node.js APIs directly to renderer code.

Use a preload bridge only if native desktop functionality is required.

Do not load arbitrary remote web content inside the privileged application window.

The normal Inventory Atlas Lite UI should load only its local packaged/local backend content.

---

# 8. Lifecycle

The desktop runtime must cleanly manage the backend process.

Expected behavior:

```text
launch Electron
    ↓
start backend
    ↓
wait until backend is ready
    ↓
open main window
```

On application exit:

```text
close Electron
    ↓
stop backend
    ↓
exit cleanly
```

Avoid leaving orphan Node/Express processes after the desktop window is closed.

Handle startup errors with a useful user-facing error instead of showing a blank window.

---

# 9. Versioning

The Windows application version must come from the same Git release tag used by Task 01.

For:

```text
v0.8.0
```

the Windows application should report:

```text
0.8.0
```

The version should be visible in at least one reasonable location such as:

```text
Settings -> About
```

or an existing About/version surface.

Do not require a developer to manually keep a separate Windows version in sync.

---

# 10. Windows GitHub Actions job

Extend the existing release workflow from Task 01 with a Windows job.

Conceptual flow:

```text
validate
   │
   ├────────────┬──────────────┐
   ▼            ▼              ▼
docker       proxmox        windows
                               │
                               ├── Setup.exe
                               └── Portable.exe
```

Use a Windows GitHub-hosted runner for the Electron packaging job unless there is a demonstrated reason to cross-build elsewhere.

The Windows job must run only for official release builds, not every normal commit.

---

# 11. Release assets

Attach both Windows binaries to the same GitHub Release.

Required names:

```text
Inventory-Atlas-Lite-Setup-X.Y.Z.exe
Inventory-Atlas-Lite-Portable-X.Y.Z.exe
```

Use deterministic artifact names based on the Git tag/version.

Update the shared:

```text
SHA256SUMS
```

to include the Windows binaries.

Example conceptual release:

```text
Inventory Atlas Lite v0.8.0

Docker
  ghcr.io/bloschinsky/inventory-atlas-lite:0.8.0

Proxmox
  inventory-atlas-lite-proxmox-v0.8.0.tar.gz

Windows
  Inventory-Atlas-Lite-Setup-0.8.0.exe
  Inventory-Atlas-Lite-Portable-0.8.0.exe

Checksums
  SHA256SUMS
```

Do not create a separate GitHub Release for Windows.

---

# 12. Release dependency rules

The final GitHub Release must not be considered successfully published with missing mandatory Windows artifacts after this task becomes active.

Recommended release dependency:

```text
validate
   ↓
docker / proxmox / windows
   ↓
release
```

or an equivalent workflow where the release is finalized only after required builds succeed.

Avoid a state where:

```text
v0.8.0 release exists
```

but the Windows job later fails silently and no `.exe` is present.

If a draft-release approach simplifies atomic publishing, it may be used.

---

# 13. Windows smoke test

Add at least a practical packaging/startup verification.

At minimum verify in CI that:

- Electron packaging succeeds;
- generated files exist;
- expected artifact names are present;
- native `better-sqlite3` packaging succeeds.

If practical, add a Windows smoke test that launches the packaged application/backend and checks the health endpoint or equivalent startup signal.

Do not make fragile GUI automation a hard requirement for the first implementation unless it is reliable.

---

# 14. Application behavior

The Windows build should preserve the same user-facing inventory behavior as the self-hosted build:

- item CRUD;
- categories;
- dynamic/custom fields;
- photos;
- search/filter/sort;
- SQLite backup/export;
- existing dashboard/UI behavior;
- any other features already present in the shared application.

Do not introduce Windows-only business rules.

---

# 15. Backup behavior

The existing database backup/export functionality must work in the packaged Windows application.

A user must be able to create a portable SQLite backup and later restore/migrate it using the supported Inventory Atlas Lite workflow.

Desktop packaging must not make the database inaccessible inside an opaque Electron archive.

---

# 16. Documentation

Update:

```text
README.md
```

and relevant docs with a Windows installation section.

Document:

- Setup vs Portable;
- where to download them;
- where local application data lives;
- where the SQLite database is stored;
- how backups work;
- how upgrades affect local data;
- minimum supported Windows version;
- any SmartScreen warning expected for unsigned builds.

GitHub Releases must remain the recommended download location.

---

# 17. Code signing

Code signing is **not required for the first implementation**.

Unsigned builds are acceptable.

However:

- do not disable Windows security features;
- document that Windows SmartScreen may warn about an unsigned executable;
- keep the build structure compatible with adding code signing later.

Do not add a private signing certificate to the repository.

---

# 18. Auto-update

Electron auto-update is explicitly out of scope for the first Windows packaging task.

Initial upgrade flow may simply be:

```text
download new Setup.exe
run installer
existing AppData/SQLite remains intact
```

Architect the app so auto-update can be added later without moving user data.

---

# 19. Out of scope

Do not implement in this task:

- macOS packaging;
- Linux desktop installers;
- Android/iOS;
- Microsoft Store publishing;
- automatic Windows updates;
- paid code-signing infrastructure;
- cloud synchronization between desktop and Proxmox installations;
- automatic two-way SQLite synchronization.

Those should be separate future tasks.

---

# Acceptance criteria

The task is complete when all of the following are true:

- [ ] Task 01 release pipeline remains functional.
- [ ] Electron is integrated without creating a separate frontend fork.
- [ ] The Windows app reuses the existing Inventory Atlas Lite application/backend logic.
- [ ] The packaged app runs without separately installed Node.js/npm/Docker.
- [ ] The Windows backend is local-only by default.
- [ ] The SQLite database lives in a persistent per-user data directory.
- [ ] Updating application binaries does not replace the SQLite database.
- [ ] `better-sqlite3` works in the packaged Electron application.
- [ ] `Inventory-Atlas-Lite-Setup-X.Y.Z.exe` is produced.
- [ ] `Inventory-Atlas-Lite-Portable-X.Y.Z.exe` is produced.
- [ ] Both files use the same version as the Git release tag.
- [ ] Both Windows files are generated automatically by the tag-driven GitHub Actions release.
- [ ] Both files are attached to the same GitHub Release as Docker/Proxmox.
- [ ] `SHA256SUMS` contains both Windows artifacts.
- [ ] A clean Windows machine can launch the packaged application without development tooling.
- [ ] Closing the application does not leave an orphan backend process.
- [ ] Existing Inventory Atlas Lite functionality still works in desktop mode.
- [ ] Backup/export functionality works in desktop mode.
- [ ] Windows usage/install/update documentation is added.

---

# Manual verification scenario

After Task 01 is stable:

1. Create a test release tag.
2. Push the tag.
3. Confirm the existing Docker and Proxmox release jobs still pass.
4. Confirm the Windows build job runs.
5. Download `Inventory-Atlas-Lite-Setup-X.Y.Z.exe`.
6. Install it on a clean Windows environment.
7. Launch Inventory Atlas Lite.
8. Add an item and photo.
9. Close and reopen the application.
10. Confirm data remains.
11. Download/run `Inventory-Atlas-Lite-Portable-X.Y.Z.exe`.
12. Confirm it launches without installation.
13. Confirm no external Node.js/npm/Docker installation is required.
14. Confirm both binaries appear on the same GitHub Release.
15. Install the next patch version.
16. Confirm the existing SQLite inventory remains intact.

---

# Result

After Task 02, one Git tag produces the complete official distribution set:

```text
Inventory Atlas Lite vX.Y.Z

├── Docker image
├── Proxmox deployment
├── Windows Setup.exe
└── Windows Portable.exe
```

All builds originate from the same repository, the same tag, and the same commit.

GitHub Releases remain the single central page where a user chooses how they want to install Inventory Atlas Lite.
