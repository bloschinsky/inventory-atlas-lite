```text
┌──────────────────────────────────────────────────────────────┐
│  ██╗ █████╗                                                  │
│  ██║██╔══██╗   INVENTORY ATLAS LITE                          │
│  ██║███████║   TRACK WHAT YOU OWN. FIND IT FAST.             │
│  ██║██╔══██║                                                 │
│  ██║██║  ██║                                                 │
│  ╚═╝╚═╝  ╚═╝                                                 │
└──────────────────────────────────────────────────────────────┘
```

# Inventory Atlas Lite

A deliberately small, self-hosted inventory app for physical items. It uses Vue 3, Express, and one SQLite database containing all data and photos. No authentication or Internet connection is required at runtime; access should be limited to a trusted LAN or VPN/Tailscale network.

## Requirements

- Node.js 20.19 or newer
- npm

## Install and develop

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The development server listens on the local network as well. Set `PORT` to move the API off port `3000`; the development proxy follows it.

## Checks

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` runs the Playwright browser tests. Install the configured browser once before the first run:

```bash
npx playwright install chromium
```

The browser tests start their own API and Vite processes on separate ports and use a temporary SQLite database that is deleted afterwards. They never read or write `data/inventory.sqlite`.

## Project documentation

See [`docs/README.md`](docs/README.md) for planned tasks, future work, and records of completed changes.

## Production

```bash
npm run build
npm start
```

Open `http://SERVER_IP:3000`. Set `PORT` to change the port. Set `DATA_DIR` to place persistent data in another directory. These environment variables work on Linux/macOS and in PowerShell (`$env:PORT=3001`).

## Install on Proxmox VE

Open the shell of a Proxmox VE node, log in as `root`, and run:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/main/scripts/proxmox-install.sh)"
```

The script must run on the Proxmox VE host, not inside an existing container. It creates a new
unprivileged Debian LXC, installs Node.js and Inventory Atlas Lite in it, starts the application as
a systemd service, and prints the URL:

```text
Inventory Atlas Lite is ready:
http://192.168.1.145:3000
```

Prefer to read the script first:

```bash
curl -fsSLo proxmox-install.sh https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/main/scripts/proxmox-install.sh
less proxmox-install.sh
bash proxmox-install.sh
```

### Container defaults

| Setting | Default |
| --- | --- |
| OS | Debian 13 (falls back to Debian 12 when no template is available) |
| Container type | Unprivileged LXC, no nesting, starts on boot |
| Hostname | `inventory-atlas-lite` |
| CPU / RAM / Swap | 1 core / 1024 MiB / 512 MiB |
| Root disk | 8 GiB |
| Network | Bridge `vmbr0`, IPv4 via DHCP |
| Port | `3000` |

The container ID defaults to the next free ID on the node. An existing ID is never reused or
overwritten. Before creating anything, the script prints the configuration and asks for confirmation.

### Overriding the defaults

Set environment variables in front of the command; `scripts/proxmox-install.sh --help` lists them all.

```bash
CTID=140 CT_HOSTNAME=atlas STORAGE=local-lvm BRIDGE=vmbr1 DISK_GB=16 CORES=2 RAM_MB=2048 IPV4=192.168.1.50/24 GATEWAY=192.168.1.1 PORT=3000 bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/main/scripts/proxmox-install.sh)"
```

By default the latest stable tagged release is installed. `APP_VERSION=v0.5.0` pins a release.
`APP_BRANCH=main` is a development override that installs an untagged branch without checksum
verification; do not use it for a production installation.

### Where things live

| Path | Contents |
| --- | --- |
| `/opt/inventory-atlas-lite/app` | Application code, replaced on every update |
| `/var/lib/inventory-atlas-lite` | SQLite database and photos, never replaced |
| `/var/lib/inventory-atlas-lite/backups` | Pre-update database backups (the last 5 are kept) |
| `/etc/inventory-atlas-lite.env` | `NODE_ENV`, `PORT`, and `DATA_DIR` |

The service runs as the dedicated non-login user `inventory-atlas`, never as root.

### Administration

Run these inside the container (`pct enter <CTID>` from the host, or `pct exec <CTID> -- <command>`):

```bash
systemctl status inventory-atlas-lite
systemctl restart inventory-atlas-lite
journalctl -u inventory-atlas-lite -f
inventory-atlas-lite-update
```

`inventory-atlas-lite-update` installs the latest stable release, or a chosen one with
`inventory-atlas-lite-update --version v0.5.0`. It writes a consistent SQLite backup first, keeps the
data directory and the environment file untouched, and restores the previous code automatically if
the new version fails its `/api/health` check.

### Backups

Proxmox backups (`vzdump`) protect the whole container. The application's **Data / Backup** page
downloads a portable SQLite snapshot that can be restored into another Inventory Atlas Lite
installation; the updater stores the same kind of snapshot before every update.

### Security

Inventory Atlas Lite has **no authentication**. Do not forward a router port to it and do not put it
behind a public reverse proxy. Keep it on a trusted LAN, or reach it remotely through a VPN such as
WireGuard or Tailscale.

## Data and backups

The database is created automatically at `data/inventory.sqlite`. It contains items, categories, fields, values, and original photo bytes. The **Data / Backup** page downloads a consistent SQLite snapshot using SQLite's backup API. Back up that downloaded file regularly.

Do not expose this application directly to the public Internet: the MVP intentionally has no authentication.
