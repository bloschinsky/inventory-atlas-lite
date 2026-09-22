# Proxmox one-line installer

## Summary

One command in the shell of a Proxmox VE node creates a dedicated unprivileged Debian LXC, installs
Inventory Atlas Lite in it under Node.js and systemd, and prints the URL of the running application.
There is no Docker layer and no reverse proxy: Express listens directly on the container's LAN
address. A companion update command installs a newer release without touching the data.

## User-visible behaviour

Run as `root` on the Proxmox host:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/master/scripts/proxmox-install.sh)"
```

- The script shows the chosen configuration and asks for confirmation before creating anything;
  `-y`/`--yes` skips the prompt and `--help` prints the options without changing anything.
- Defaults: Debian 13, unprivileged LXC, hostname `inventory-atlas-lite`, 1 core, 2048 MiB RAM,
  512 MiB swap, 8 GiB disk, DHCP on `vmbr0`, port `3000`, start on boot. CT ID, hostname, storage,
  bridge, disk, CPU, RAM, network, OS version, port, and release are overridable through environment
  variables.
- It refuses to continue if the selected CT ID already exists, and reports the created CT ID if a
  later step fails.
- On success it prints the container ID, IP address, application URL, and the update, service-status,
  and log commands.
- Inside the container, `inventory-atlas-lite-update` installs the latest stable release (or a
  specific one), backs up the database first, and rolls the code back if the new version fails its
  health check.

[`docs/proxmox.md`](../proxmox.md) is the operator guide for overrides, storage layout, updates, and
backups.

## Implementation overview

- `scripts/proxmox-install.sh` runs on the host: it requires root, checks for Proxmox
  (`pveversion`, `pct`, `pveam`), picks a free CT ID, resolves and downloads the Debian template
  matching the host architecture, creates and starts the container, waits for networking with a
  finite timeout, runs the container-side installer, and verifies health before reporting success.
- `scripts/install.sh` runs inside the container: it installs the pinned Node.js 22 LTS and build
  dependencies, downloads the requested release, verifies it against the published `SHA256SUMS`,
  runs `npm ci` and the production build in a staging directory, and swaps the code into place.
- `scripts/update.sh` is installed as `/usr/local/sbin/inventory-atlas-lite-update`. It takes a
  timestamped SQLite backup, builds the new release in staging, stops the service only for the swap,
  waits for `/api/health` to report the expected version, and restores the previous code if the
  check fails. It keeps the last 5 backups.
- `scripts/lib.sh` holds the shared paths and helpers: service `inventory-atlas-lite`, non-login user
  `inventory-atlas`, code in `/opt/inventory-atlas-lite/app`, data in `/var/lib/inventory-atlas-lite`
  (backups in its `backups/` subdirectory), and the root-owned environment file
  `/etc/inventory-atlas-lite.env` with `NODE_ENV`, `PORT`, and `DATA_DIR`.
- `deploy/inventory-atlas-lite.service` runs the application as the dedicated user with
  `Restart=on-failure`, an `EnvironmentFile`, and a stop timeout that lets SQLite close cleanly.
- `GET /api/health` in `server/src/routes/systemRoutes.js` returns `{ "status": "ok", "database": "ok", "version": … }`
  after a minimal SQLite query succeeds, and `503` otherwise. It exposes no paths, environment, or
  stack traces, and both scripts poll it as their readiness check.

## Verification

- `test/scripts.test.js` covers the shell validators (accepted and rejected/injected values),
  `--help` output that changes nothing, the refusal to run outside the expected context, the
  separation of persistent data from the replaceable application directory, the rollback after a
  failed update, the documented raw URLs, progress output that cannot pollute a captured value, the
  Node.js `PATH` entry, architecture-aware template selection, and `shellcheck` when it is installed.
- `test/e2e.test.js` covers `/api/health` including the reported version.
- The installer and the updater were run on a real Proxmox VE node; see
  [`../changes/2026-09-16-proxmox-real-node-fixes.md`](../changes/2026-09-16-proxmox-real-node-fixes.md).

## Notes and limitations

- The application has no authentication. Do not expose the container directly to the Internet; use a
  trusted LAN or VPN/Tailscale.
- No TLS, reverse proxy, DNS, or firewall/port-forward configuration is set up, and the Proxmox host
  configuration is not modified.
- There is no uninstall command and no automatic container removal.
- The one-line install fetches the scripts over HTTPS; the release archive is additionally verified
  against `SHA256SUMS`. `docs/proxmox.md` documents the inspect-first alternative.
- Official releases package the same tracked source layout and legacy asset name used by the
  installer and by updater versions installed before the release pipeline.
- `raw.githubusercontent.com` can serve a stale script for a few minutes after a push, which matters
  when testing installer changes immediately.
