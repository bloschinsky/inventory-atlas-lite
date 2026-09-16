# Proxmox one-line LXC installer

- **Completed:** 2026-09-16
- **Version:** 0.5.0
- **Task:** [`docs/issues/TASK-proxmox-one-line-installer.md`](../issues/TASK-proxmox-one-line-installer.md)

## Summary

Inventory Atlas Lite can now be installed on a Proxmox VE node with a single command that creates a
dedicated unprivileged Debian LXC and runs the application directly under Node.js, without Docker.

### Health endpoint

`GET /api/health` returns `{ "status": "ok", "database": "ok", "version": "0.5.0" }` with HTTP `200`
when a minimal SQLite query succeeds, and HTTP `503` otherwise. The version comes from
`package.json`, the single source of truth for the project version. The response carries no paths,
environment values, or stack traces because the deployment scripts poll it from outside the
application. No existing route changed.

### Deployment scripts

| File | Role |
| --- | --- |
| `scripts/proxmox-install.sh` | Runs on the Proxmox VE host: validates input, creates and starts the LXC, installs the application in it, verifies health, prints the URL |
| `scripts/install.sh` | Runs inside the container: installs Node.js and the application, creates the service account and systemd unit |
| `scripts/update.sh` | Installed as `/usr/local/sbin/inventory-atlas-lite-update`: updates the code with a pre-update backup and automatic rollback |
| `scripts/lib.sh` | Shared constants, input validation, release download and verification, atomic code swap, health polling |
| `deploy/inventory-atlas-lite.service` | Hardened systemd unit for the application |

Layout inside the container:

- `/opt/inventory-atlas-lite/app` — application code, owned by root, replaced on every update;
- `/opt/inventory-atlas-lite/previous` — the code replaced by the last update, used for rollback;
- `/var/lib/inventory-atlas-lite` — SQLite database and photos, owned by `inventory-atlas`;
- `/var/lib/inventory-atlas-lite/backups` — pre-update backups, the last 5 are kept;
- `/etc/inventory-atlas-lite.env` — `NODE_ENV`, `PORT`, `DATA_DIR`, mode `0640`, owned by `root:inventory-atlas`.

The service runs as the non-login system user `inventory-atlas`. Code and data are on separate paths,
so an update replaces only `app`; the data directory and the environment file are never touched.

Design decisions worth recording:

- The default container is Debian 13, 1 core, 1024 MiB RAM, 512 MiB swap, an 8 GiB disk on the first
  active `rootdir` storage, DHCP on `vmbr0`, unprivileged, no nesting, autostart on boot. Every value
  is overridable through documented environment variables, and the chosen configuration is printed
  for confirmation before anything is created.
- Node.js is installed from the official `nodejs.org` tarball for the pinned LTS major (22), with the
  exact patch release resolved at install time and verified against `SHASUMS256.txt`. This avoids a
  third-party apt repository and keeps the major from drifting.
- Releases are fetched as GitHub source archives for a tag. When the release publishes a `SHA256SUMS`
  asset, the archive is verified against it; otherwise the script warns and relies on HTTPS.
  `APP_BRANCH` is the documented development override and is never the default.
- `node_modules` is never shipped: the installer runs `npm ci` with the committed lockfile inside the
  container, builds the client, then prunes development dependencies, so `better-sqlite3` is always
  built for the target system.
- The host installer downloads the container-side scripts to a file, checks that they are shell
  scripts, and pushes them into the container with `pct push` instead of piping anything into `bash`.
- Nothing is destroyed automatically. An existing CT ID is refused, and a container created by a run
  that fails later is left in place with its ID reported.

### Version and documentation

The version moved to `0.5.0` in `package.json` and `package-lock.json`. The README gained an
**Install on Proxmox VE** section with the one-line command, the inspect-first alternative, the
container defaults, the override variables, the storage layout, the administration and update
commands, the backup guidance, and an explicit warning against exposing the application publicly.
`.gitattributes` forces LF endings for `*.sh` and `*.service` so the scripts stay runnable on Linux
when the repository is checked out on Windows.

## Verification

```bash
npm run lint    # pass
npm test        # 10 pass, 1 skip (shellcheck not installed by default)
npm run build   # pass
npm run test:e2e # 8 passed
```

`test/scripts.test.js` is new and covers the shell logic through bash:

- validation accepts realistic CT IDs, ports, bridges, storages, IPv4 configurations, versions,
  branches and hostnames, and rejects empty, out-of-range, and injection-shaped values such as
  `vmbr0; rm -rf /`, `$(id)`, `../../etc/passwd`, and `192.168.1.50/33`;
- `--help` works for all three entry scripts and changes nothing;
- the scripts fail safely out of context: the host installer refuses a non-Proxmox host, the
  container installer refuses to run without `lib.sh`, and the updater refuses to run without an
  installation;
- the data directory is not inside the replaceable application directory;
- `ial_install_code` followed by `ial_rollback_code` restores the previous code and leaves the data
  file untouched, which is the path a failed update health check takes.

`shellcheck --shell=bash --external-sources scripts/*.sh` was run manually against all four scripts
and reports no findings. The two suppressions in the scripts are documented in place: `SC2034` for
the constants in `lib.sh` that only sourcing scripts read, and `SC2012` for listing backup files that
this script itself names. The test runs shellcheck when it is on `PATH` and skips otherwise.

The browser suite was re-run unchanged: this task adds no user-facing UI, so no Playwright test was
added or modified.

## Still required before calling the installer production-ready

No Proxmox VE node was available, so **the full deployment was not tested**. The host-side logic
(`pct`, `pveam`, `pvesm`) and the in-container installation have not run anywhere yet.

Two things must happen before the README command works for a user:

1. A GitHub release must be published (starting with `v0.5.0`), because `APP_VERSION=latest`
   resolves the latest release through the GitHub API and fails when none exists. Publishing a
   `SHA256SUMS` asset alongside it enables checksum verification.
2. The manual smoke test below must pass on a fresh node.

### Manual smoke test

1. Run the README command in the shell of a Proxmox VE node as root and accept the defaults.
2. Confirm that a new unprivileged LXC is created, starts, and reports an IP address.
3. Open the printed URL from another device on the LAN.
4. Create a category and an item with a photo.
5. Reboot the container (`pct reboot <CTID>`) and confirm the item and the service return.
6. Run `inventory-atlas-lite-update` and confirm the data survives and a backup is written to
   `/var/lib/inventory-atlas-lite/backups`.
7. Download a backup from the **Data / Backup** page and open it with `sqlite3`.
8. Reboot the Proxmox host and confirm the container autostarts and the service becomes healthy.
