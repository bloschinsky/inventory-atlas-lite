# Task — Cross-Platform Desktop Distribution: macOS & Linux

## Status

Planned.

## Depends on

`docs/issues/TASK-02-WINDOWS-ELECTRON-RELEASE.md`

This task must be implemented only after the Windows Electron distribution is working and the shared Electron desktop runtime is stable.

## Goal

Extend the existing Inventory Atlas Lite Electron desktop distribution from Windows to:

- macOS;
- Linux.

Do not create separate platform forks.

Reuse the same:

- Vue frontend;
- Express backend;
- SQLite storage model;
- Electron runtime;
- application logic;
- release version/tag;
- desktop lifecycle.

Target result for every official release tag:

```text
vX.Y.Z
```

the release pipeline should additionally produce desktop builds for macOS and Linux.

---

# Target distribution matrix

After this task:

```text
Inventory Atlas Lite vX.Y.Z

Windows
├── Inventory-Atlas-Lite-Setup-X.Y.Z.exe
└── Inventory-Atlas-Lite-Portable-X.Y.Z.exe

macOS
└── Inventory-Atlas-Lite-X.Y.Z-macOS-Universal.dmg

Linux
├── Inventory-Atlas-Lite-X.Y.Z-x86_64.AppImage
└── inventory-atlas-lite_X.Y.Z_amd64.deb

Self-hosted
├── Docker / GHCR
└── Proxmox assets

Checksums
└── SHA256SUMS
```

All artifacts must be generated from the same Git tag and commit.

---

# 1. Architectural principle

Do not create:

- separate macOS frontend;
- separate Linux frontend;
- separate backend implementation;
- separate business logic;
- platform-specific SQLite schemas.

The existing Electron desktop runtime introduced by:

```text
TASK-02-WINDOWS-ELECTRON-RELEASE.md
```

must become the shared cross-platform desktop runtime.

Platform-specific code is allowed only where required for:

- packaging;
- filesystem paths;
- OS integration;
- icons;
- lifecycle differences;
- signing/notarization;
- installer formats.

---

# 2. Shared Electron runtime

Refactor the Electron packaging/runtime structure only where necessary so the same desktop implementation can run on:

```text
Windows
macOS
Linux
```

The core startup flow must remain conceptually identical:

```text
launch Electron
    ↓
resolve desktop data directory
    ↓
start existing Inventory Atlas backend
    ↓
wait until backend is ready
    ↓
open BrowserWindow
    ↓
use existing Vue frontend
```

Do not duplicate startup logic per OS unless a platform-specific branch is truly necessary.

---

# 3. Desktop data directory

Use Electron/platform-appropriate user data directories.

The SQLite database and persistent application data must not live inside the packaged application bundle.

Expected conceptual locations:

```text
Windows
%APPDATA%\Inventory Atlas Lite\

macOS
~/Library/Application Support/Inventory Atlas Lite/

Linux
~/.config/Inventory Atlas Lite/
```

Use Electron APIs rather than hard-coding paths where possible.

Application upgrades must preserve:

- SQLite database;
- photos;
- settings;
- backup-related data;
- paired/local runtime configuration where applicable.

Do not store mutable production data inside:

```text
.app
AppImage
/usr
/opt
Program Files
```

or another application-installation directory.

---

# 4. Native Node dependencies

The project contains native/runtime-sensitive dependencies such as:

```text
better-sqlite3
sharp
onnxruntime-node
```

The build process must ensure these dependencies are compatible with the target:

```text
OS
+
CPU architecture
+
Electron runtime
```

Do not reuse native binaries built for another operating system.

Each platform build must rebuild/package native dependencies correctly for its own target.

The final packaged application must not require:

- Node.js;
- npm;
- compiler toolchains;
- Python;
- Visual Studio Build Tools;
- Xcode command-line tools;
- system-level native dependency installation.

---

# 5. macOS target

Create an official macOS distribution.

Primary artifact:

```text
Inventory-Atlas-Lite-X.Y.Z-macOS-Universal.dmg
```

Preferred target:

```text
Universal
├── x64
└── arm64
```

One Universal DMG is preferred over separate Intel and Apple Silicon downloads if the native dependency stack supports reliable universal packaging.

If Universal packaging proves technically unreliable because of native dependencies, fallback is acceptable:

```text
Inventory-Atlas-Lite-X.Y.Z-macOS-x64.dmg
Inventory-Atlas-Lite-X.Y.Z-macOS-arm64.dmg
```

Document the reason if this fallback is used.

---

# 6. macOS application behavior

The macOS build must behave like the Windows Electron build.

Required:

- launch from Finder;
- use persistent user data;
- open the same Vue UI;
- use the same Express backend;
- support the same SQLite database model;
- preserve backups/restores;
- close backend processes cleanly when the application exits;
- not require Terminal for normal use.

Use normal macOS application conventions where practical.

---

# 7. macOS signing and notarization

Design the release flow to support proper Apple signing and notarization.

The implementation should support:

```text
build
↓
sign
↓
notarize
↓
package DMG
↓
publish
```

Credentials must come from CI secrets.

Never commit:

- signing certificates;
- private keys;
- Apple account credentials;
- notarization secrets.

If valid signing/notarization credentials are not yet available, the first implementation may support unsigned development/test DMGs, but:

- unsigned builds must not silently be presented as production-ready;
- documentation must explain the Gatekeeper limitation;
- the CI structure must be ready for signing/notarization without major redesign.

For official public macOS distribution, signing/notarization should be considered the target state.

---

# 8. Linux targets

Create official Linux desktop builds.

Required artifacts:

```text
Inventory-Atlas-Lite-X.Y.Z-x86_64.AppImage
inventory-atlas-lite_X.Y.Z_amd64.deb
```

Target architecture for this task:

```text
x86_64 / amd64
```

Do not add Linux ARM builds in this task.

---

# 9. Linux AppImage

The AppImage build must:

- run without a traditional installation process;
- contain all required application runtime assets;
- use the standard user-data directory;
- not write the database beside the AppImage by default;
- launch the same Electron desktop application.

Expected usage:

```text
download
↓
mark executable if required
↓
run
```

Do not require the user to clone the repository or run npm.

---

# 10. Linux DEB package

Create:

```text
inventory-atlas-lite_X.Y.Z_amd64.deb
```

Target Debian-family systems such as:

- Debian;
- Ubuntu;
- Linux Mint;
- related distributions.

The package should:

- install the desktop application;
- provide an application-menu entry;
- include a proper application icon;
- uninstall cleanly;
- preserve normal user data on package upgrade;
- avoid running the backend as a system-wide daemon.

Inventory Atlas Lite remains a per-user desktop application.

---

# 11. Linux scope

Do not create all possible Linux package formats in this task.

Out of scope:

```text
rpm
snap
flatpak
pacman/AUR
Nix
Linux ARM
```

AppImage + DEB are sufficient for the first official Linux release.

Additional formats should be driven by future demand.

---

# 12. Platform icons

Provide appropriate application icons for each platform.

Expected:

```text
Windows → .ico
macOS   → .icns
Linux   → PNG/icon set
```

Use the existing Inventory Atlas Lite logo/branding.

Do not create different branding per platform.

Ensure packaging references the correct icon assets.

---

# 13. GitHub Actions build matrix

Extend the existing tag-driven release workflow.

Use platform-native runners.

Target conceptual matrix:

```text
git tag vX.Y.Z
        │
        ▼
GitHub Actions
        │
        ├── validate
        │
        ├── docker
        │
        ├── proxmox
        │
        ├── windows
        │      └── windows-latest
        │
        ├── linux
        │      └── ubuntu-latest
        │
        └── macos
               └── macos-latest
```

Do not attempt to produce all native desktop builds from one operating system.

Platform-specific native dependencies must be built on compatible runners.

---

# 14. Release flow

All desktop artifacts must be attached to the same GitHub Release created from the release tag.

Do not create:

```text
Windows release
macOS release
Linux release
```

as separate releases.

Expected:

```text
GitHub Release: Inventory Atlas Lite vX.Y.Z
```

containing all supported distribution artifacts.

---

# 15. Release dependency

The final release should not be considered complete when mandatory platform builds are missing.

Recommended conceptual flow:

```text
validate
   ↓
docker / proxmox / windows / linux / macos
   ↓
release
```

or an equivalent atomic/draft release workflow.

Avoid publishing a normal release where one required platform job failed and its artifact is silently absent.

If macOS signing/notarization is intentionally optional during the transition period, document the exact policy clearly in the workflow.

---

# 16. Artifact naming

Use deterministic versioned filenames.

Required examples:

```text
Inventory-Atlas-Lite-Setup-0.30.0.exe
Inventory-Atlas-Lite-Portable-0.30.0.exe

Inventory-Atlas-Lite-0.30.0-macOS-Universal.dmg

Inventory-Atlas-Lite-0.30.0-x86_64.AppImage
inventory-atlas-lite_0.30.0_amd64.deb
```

If separate macOS architecture builds are required:

```text
Inventory-Atlas-Lite-0.30.0-macOS-x64.dmg
Inventory-Atlas-Lite-0.30.0-macOS-arm64.dmg
```

Do not use ambiguous filenames such as:

```text
app.dmg
release.AppImage
linux.deb
```

---

# 17. SHA256SUMS

Update the shared release checksum file.

It must include all desktop release artifacts.

Example:

```text
SHA256SUMS

... Setup.exe
... Portable.exe
... macOS-Universal.dmg
... x86_64.AppImage
... amd64.deb
```

Checksums must be generated from the final published artifacts.

---

# 18. Versioning

All desktop builds must use the same application version derived from the release tag.

Example:

```text
tag:
v0.30.0
```

must produce:

```text
Windows: 0.30.0
macOS:   0.30.0
Linux:   0.30.0
```

Do not maintain independent platform version numbers.

The existing About/version UI must report the same release version on all desktop platforms.

---

# 19. Desktop feature parity

The macOS and Linux builds must preserve the same application functionality as the Windows Electron build.

At minimum verify:

- item CRUD;
- categories;
- custom/dynamic fields;
- photos;
- search/filter/sort;
- dashboard;
- AI settings/features where configured;
- database backup;
- database restore;
- About/version information;
- local persistent SQLite storage.

Do not introduce platform-specific business behavior.

---

# 20. Local Network Access compatibility

The desktop architecture must remain compatible with:

```text
TASK-LOCAL-NETWORK-ACCESS.md
```

or its final repository path if renamed.

The Local Network Access feature should be designed so that it can later work on:

```text
Windows
macOS
Linux
```

Do not hard-code the shared networking implementation around Windows-only APIs.

Platform-specific firewall/help text may differ.

This task does not need to implement additional LAN functionality beyond what exists at the time, but must not make the Electron runtime architecture Windows-only.

---

# 21. Auto-update compatibility

Do not implement a new auto-update system in this task unless the existing project already has an approved desktop updater architecture.

However, packaging must not block future per-platform auto-update support.

Keep:

- version metadata correct;
- user data outside application bundles;
- release artifacts deterministic;
- signing structure compatible with future update delivery.

---

# 22. CI smoke tests

Add practical build verification for each platform.

At minimum verify:

### Windows

Keep the existing Windows packaging checks from Task 02.

### Linux

Verify:

- AppImage is generated;
- DEB is generated;
- native dependencies package successfully;
- required files exist;
- application version is correct.

Where practical, perform a non-GUI startup/backend health smoke test.

### macOS

Verify:

- DMG is generated;
- target architecture is correct;
- native dependencies package successfully;
- application version is correct;
- signing/notarization step runs when credentials are configured.

Avoid fragile full GUI automation unless reliable.

---

# 23. Manual verification — macOS

Test on macOS.

Required scenario:

1. Download the official DMG.
2. Open the DMG.
3. Install/copy Inventory Atlas Lite into Applications.
4. Launch the application.
5. Confirm the desktop UI loads.
6. Add an item.
7. Add a photo.
8. Close the application.
9. Reopen it.
10. Confirm data persists.
11. Create a backup.
12. Confirm backup works.
13. Confirm About displays the release version.
14. Upgrade to the next version.
15. Confirm the existing SQLite database remains intact.
16. Confirm no orphan backend process remains after exit.
17. On Apple Silicon, confirm the application runs natively.
18. If Universal build is used, verify Intel compatibility separately where practical.

---

# 24. Manual verification — Linux

Test on a representative Debian/Ubuntu-family distribution.

### AppImage

1. Download AppImage.
2. Make executable if required.
3. Run it.
4. Confirm the UI opens.
5. Add an item/photo.
6. Close and reopen.
7. Confirm data persists.
8. Confirm backup works.
9. Confirm About/version.

### DEB

1. Install the DEB.
2. Launch Inventory Atlas Lite from the application menu.
3. Confirm the application works.
4. Upgrade to a newer DEB.
5. Confirm user data remains.
6. Remove the package.
7. Confirm no background server remains running.

---

# 25. Documentation

Update:

```text
README.md
```

and relevant deployment/release documentation.

Add a Desktop Downloads section covering:

```text
Windows
macOS
Linux
```

Document:

- available artifact formats;
- which file normal users should download;
- supported CPU architectures;
- data-directory behavior;
- backup behavior;
- upgrade behavior;
- macOS Gatekeeper/signing status;
- Linux AppImage execution requirements;
- Linux DEB installation;
- known platform limitations.

GitHub Releases remains the canonical desktop download location.

---

# 26. Supported platforms

Initial target scope:

```text
Windows
- x64

macOS
- x64
- arm64
- preferably one Universal distribution

Linux
- x86_64 / amd64
```

Do not add in this task:

```text
Windows ARM
Linux ARM
Android
iOS
ChromeOS native packaging
```

---

# 27. Failure handling

A failure to build one platform must be visible in CI.

Do not silently skip:

- failed native dependency rebuilds;
- missing release artifacts;
- failed macOS signing/notarization;
- wrong architecture;
- missing checksums.

The release workflow must make platform state explicit.

---

# 28. Out of scope

Do not implement in this task:

- Android application;
- iOS application;
- Microsoft Store publishing;
- Mac App Store publishing;
- Snap Store publishing;
- Flatpak/Flathub publishing;
- Linux RPM;
- AUR;
- Linux ARM;
- Windows ARM;
- cloud sync;
- separate mobile frontend;
- platform-specific inventory databases;
- new business features unrelated to packaging.

---

# Acceptance criteria

The task is complete when all of the following are true:

- [ ] `TASK-02-WINDOWS-ELECTRON-RELEASE.md` is implemented and remains functional.
- [ ] The same Electron runtime is used for Windows, macOS, and Linux.
- [ ] No separate platform forks are created.
- [ ] macOS builds are generated automatically from release tags.
- [ ] Linux builds are generated automatically from release tags.
- [ ] macOS supports Apple Silicon.
- [ ] macOS supports Intel either through Universal build or a documented separate x64 artifact.
- [ ] macOS DMG packaging works.
- [ ] macOS signing/notarization support is integrated into CI or explicitly documented as temporarily unavailable.
- [ ] Linux AppImage is produced.
- [ ] Linux DEB is produced.
- [ ] Linux target is x86_64/amd64.
- [ ] Native dependencies are built correctly per target platform/architecture.
- [ ] `better-sqlite3` works in packaged macOS and Linux applications.
- [ ] `sharp` works in packaged macOS and Linux applications.
- [ ] `onnxruntime-node` works where required by application features.
- [ ] The application does not require Node.js/npm on end-user machines.
- [ ] Desktop data uses platform-appropriate persistent user directories.
- [ ] Upgrades preserve SQLite data.
- [ ] Backup/restore works on macOS and Linux.
- [ ] Existing desktop functionality has feature parity across supported platforms.
- [ ] GitHub Actions uses platform-native runners.
- [ ] All platform artifacts use the same version/tag.
- [ ] All artifacts are attached to the same GitHub Release.
- [ ] Artifact filenames are deterministic and versioned.
- [ ] `SHA256SUMS` includes macOS and Linux artifacts.
- [ ] CI detects missing or failed platform builds.
- [ ] README/documentation explains downloads and installation for all supported desktop platforms.
- [ ] The architecture remains compatible with the Local Network Access feature.

---

# Result

After this task, one release tag produces a complete multi-platform Inventory Atlas Lite desktop release:

```text
git tag vX.Y.Z
        │
        ▼
GitHub Actions
        │
        ├── Windows
        │     ├── Setup.exe
        │     └── Portable.exe
        │
        ├── macOS
        │     └── Universal DMG
        │
        ├── Linux
        │     ├── AppImage
        │     └── DEB
        │
        ├── Docker / GHCR
        ├── Proxmox
        └── SHA256SUMS
```

Inventory Atlas Lite remains one codebase and one application architecture, while users can choose the native desktop package for their operating system.
