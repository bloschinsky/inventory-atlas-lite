# Install Inventory Atlas Lite on Proxmox VE

One command creates a dedicated unprivileged Debian LXC on a Proxmox VE node, installs Inventory
Atlas Lite in it under Node.js, and starts it as a systemd service. There is no Docker layer and no
reverse proxy: Express listens directly on the container's LAN address.

```text
Proxmox VE host
└── unprivileged Debian LXC
    └── Node.js
        └── Inventory Atlas Lite
            └── SQLite database and photos
```

## Install

Open the shell of a Proxmox VE node, log in as `root`, and run:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/master/scripts/proxmox-install.sh)"
```

The script must run on the Proxmox VE host, not inside an existing container. It prints the
configuration and asks for confirmation before creating anything, then reports the URL:

```text
Inventory Atlas Lite is ready:
http://192.168.1.145:3000
```

Prefer to read the script before running it:

```bash
curl -fsSLo proxmox-install.sh https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/master/scripts/proxmox-install.sh
less proxmox-install.sh
bash proxmox-install.sh
```

## Container defaults

| Setting | Default |
| --- | --- |
| OS | Debian 13 (falls back to Debian 12 when no template is available) |
| Container type | Unprivileged LXC, no nesting, starts on boot |
| Hostname | `inventory-atlas-lite` |
| CPU / RAM / Swap | 1 core / 2048 MiB / 512 MiB |
| Root disk | 8 GiB |
| Network | Bridge `vmbr0`, IPv4 via DHCP |
| Port | `3000` |

The container ID defaults to the next free ID on the node. An existing ID is never reused or
overwritten, and a container created by a run that later fails is left in place with its ID reported
so nothing is destroyed automatically.

## Overriding the defaults

Set environment variables in front of the command. `scripts/proxmox-install.sh --help` lists them all.

```bash
CTID=140 CT_HOSTNAME=atlas STORAGE=local-lvm BRIDGE=vmbr1 DISK_GB=16 CORES=2 RAM_MB=2048 \
IPV4=192.168.1.50/24 GATEWAY=192.168.1.1 PORT=3000 \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/master/scripts/proxmox-install.sh)"
```

| Variable | Meaning |
| --- | --- |
| `CTID` | Container ID (default: next free ID) |
| `CT_HOSTNAME` | Container hostname |
| `STORAGE` | Storage for the root disk (default: first active `rootdir` storage) |
| `TEMPLATE_STORAGE` | Storage holding LXC templates (default: `local`, or the first active one) |
| `BRIDGE` | Network bridge |
| `DISK_GB`, `CORES`, `RAM_MB`, `SWAP_MB` | Container resources |
| `IPV4` | `dhcp`, or a static address such as `192.168.1.50/24` |
| `GATEWAY` | Gateway, required with a static address |
| `OS_VERSION` | Debian major version, `13` or `12` |
| `PORT` | Application port |
| `APP_VERSION` | Release tag to install, or `latest` |
| `APP_BRANCH` | Development override, see below |

Passing `-y` skips the confirmation prompt, for example when the installer runs from another script.

## Releases and integrity

By default the installer resolves the latest stable tagged release through the GitHub API.
[GitHub Releases](https://github.com/bloschinsky/inventory-atlas-lite/releases) is the canonical
download page. Every release publishes two Proxmox assets:

| Asset | Contents |
| --- | --- |
| `inventory-atlas-lite-<tag>.tar.gz` | The application source for that tag |
| `SHA256SUMS` | The SHA-256 checksum of that archive |

The installer downloads the archive, downloads `SHA256SUMS`, and refuses to continue when the
checksum does not match or when the archive is present without its checksum file. `node_modules` is
never shipped: dependencies are installed inside the container with `npm ci` from the committed
lockfile, so `better-sqlite3` is always built for the target system.

Pin a specific release with `APP_VERSION=v0.8.0`. Verify an archive by hand with:

```bash
sha256sum --check SHA256SUMS
```

`APP_BRANCH=master` is a documented development override that installs an untagged branch. It skips
checksum verification and prints a warning; do not use it for a production installation.

## Where things live

| Path | Contents |
| --- | --- |
| `/opt/inventory-atlas-lite/app` | Application code, replaced on every update |
| `/opt/inventory-atlas-lite/previous` | The code replaced by the last update, kept for rollback |
| `/var/lib/inventory-atlas-lite` | SQLite database and photos, never replaced |
| `/var/lib/inventory-atlas-lite/backups` | Pre-update database backups (the last 5 are kept) |
| `/var/lib/inventory-atlas-lite/pre-restore-backups` | Safety copies written before a restore from **Data / Backup** (the last 10 are kept) |
| `/var/lib/inventory-atlas-lite/pre-reset-backups` | Safety copies written before an inventory reset, never removed automatically |
| `/var/lib/inventory-atlas-lite/cloud-backup-credentials.json` | Dropbox and Google Drive refresh tokens for **Settings → Cloud Backup**, readable only by the service user |
| `/var/lib/inventory-atlas-lite/cloud-backup.json` | Cloud backup schedule, retention, and recent results |
| `/var/lib/inventory-atlas-lite/update-status.json` | Progress of the last update, written by the updater |
| `/var/lib/inventory-atlas-lite/update-requested` | The marker the application creates to ask for an update |
| `/etc/inventory-atlas-lite.env` | `NODE_ENV`, `PORT`, `DATA_DIR`, and `DEPLOYMENT_TYPE` |
| `/etc/systemd/system/inventory-atlas-lite-update.service` | The privileged updater, a oneshot unit of its own |
| `/etc/systemd/system/inventory-atlas-lite-update.path` | The watcher that starts it when the marker appears |

The service runs as the dedicated non-login user `inventory-atlas`, never as root. The code is owned
by root and is only readable by the service user, so the application cannot modify its own code or
the environment file.

To enable **Settings → Cloud Backup**, add the provider app credentials to
`/etc/inventory-atlas-lite.env` inside the container and restart the service with
`systemctl restart inventory-atlas-lite`:

```bash
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Optional: the schedule time zone and a fixed OAuth callback URL.
TZ=Europe/Kyiv
CLOUD_BACKUP_REDIRECT_URI=https://inventory.example.ts.net/api/cloud-backup/oauth/callback
```

Updates never replace this file. See [`features/cloud-backup.md`](features/cloud-backup.md) for the
provider setup and the redirect URI rules.

## Administration

Open a shell in the container with `pct enter <CTID>` and run:

```bash
systemctl status inventory-atlas-lite
systemctl restart inventory-atlas-lite
journalctl -u inventory-atlas-lite -f
inventory-atlas-lite-update
```

To run them from the Proxmox host instead, give the updater its full path. `pct exec` uses
`PATH=/sbin:/bin:/usr/sbin:/usr/bin`, which does not include the `/usr/local/sbin` the updater is
installed into, so the bare name fails with "Failed to exec". The same applies to a command passed as
an argument to `ssh`, because that is not a login shell either.

```bash
pct exec <CTID> -- systemctl status inventory-atlas-lite
pct exec <CTID> -- journalctl -u inventory-atlas-lite -n 50
pct exec <CTID> -- /usr/local/sbin/inventory-atlas-lite-update
```

The updater started from the application runs as its own unit, so its output is inspected there:

```bash
systemctl status inventory-atlas-lite-update
journalctl -u inventory-atlas-lite-update -n 50
```

`GET /api/health` answers `{"status":"ok","database":"ok","version":"0.8.0"}` while the service is
running and SQLite is usable. The installer and updater require both healthy status and the expected
version before reporting success.

## Updating

```bash
inventory-atlas-lite-update                  # latest stable release
inventory-atlas-lite-update --version v0.8.0 # a specific release
```

The same update can be started from the application: **About → Check for updates → Update to
`<version>`**. It runs exactly this updater and is described in
[`features/self-update.md`](features/self-update.md). Progress is shown in the dialog and the page
reloads when the new version is healthy.

An installation created before this feature existed registers the updater units during its next
command-line update, but that run is still driven by the previous release's script. Run
`inventory-atlas-lite-update` once more afterwards, or re-run the installer, so the units are
registered; until then **About** reports that this installation cannot update itself.

The updater resolves and downloads the requested release first, so an unavailable or invalid version
fails before the running installation is touched. It then writes a consistent SQLite backup to
`/var/lib/inventory-atlas-lite/backups`, stops the service only for the final code swap, and restarts
it. If the new version does not pass its `/api/health` check within the timeout, the previous code is
restored and restarted automatically, together with the database backup it took before the update,
because a failed release may already have migrated the schema. The data directory and the
environment file are never replaced.

The last 5 pre-update backups are kept. Older ones are removed; nothing else in the data directory is
ever deleted.

The update installs dependencies and builds the client while the application keeps running, which
needs well over a gigabyte of memory at its peak. Containers created before the default was raised to
2048 MiB should be given the same on the Proxmox host, or the OOM killer can stop the build and the
whole container with it:

```bash
pct set <CTID> -memory 2048
```

An updater killed that way cannot report a final state. About treats its last state as interrupted
once it is older than the updater's one-hour timeout, and a new update can then be started.

## Backups

Proxmox backups (`vzdump`) protect the whole container, including the LXC configuration. The
application's **Data / Backup** page downloads a portable SQLite snapshot that can be restored into
another Inventory Atlas Lite installation, which is what you want when moving the inventory
elsewhere. The updater stores the same kind of snapshot before every update, and a restore or an
inventory reset from **Data / Backup** writes one to `pre-restore-backups` or `pre-reset-backups`
first. Pre-reset copies are never pruned; delete the ones you no longer need yourself.

## Security

Inventory Atlas Lite has **no authentication**. Anyone who can reach the port can read and change the
whole inventory.

- Do not forward a router port to the container.
- Do not put it behind a public reverse proxy.
- Keep it on a trusted LAN, or reach it remotely through a VPN such as WireGuard or Tailscale.

Updating from the application does not change this. The web application keeps running as
`inventory-atlas` with `NoNewPrivileges=true` and is given no sudo rights at all: it can only create
the marker file `/var/lib/inventory-atlas-lite/update-requested` in its own data directory, which a
systemd path unit turns into a start of the one predefined updater unit. No command, version, URL,
repository, or argument can be passed from the browser into that privileged unit, only published
stable releases of the official repository are installed, and their checksums are verified as
before. Anyone who can reach the unauthenticated interface can start an update, which is one more
reason to keep it off the public Internet.

The installer does not change the Proxmox firewall, does not configure DNS, TLS, or a domain, and
grants the container no extra features, device access, nesting, or privileged mode.
