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

Run this in the shell of a Proxmox VE node as `root` to create a dedicated unprivileged Debian LXC
with Inventory Atlas Lite in it:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/master/scripts/proxmox-install.sh)"
```

The script prints the configuration for confirmation, installs the latest stable release after
verifying its `SHA256SUMS`, and reports the URL of the running application. Defaults are 1 core,
1024 MiB RAM, an 8 GiB disk, DHCP on `vmbr0`, and port `3000`.

See [`docs/proxmox.md`](docs/proxmox.md) for the container settings you can override, the release and
checksum details, where the code and the database are stored, and how to update, inspect, and back up
the installation.

## Data and backups

The database is created automatically at `data/inventory.sqlite`. It contains items, categories, fields, values, and original photo bytes. The **Data / Backup** page downloads a consistent SQLite snapshot using SQLite's backup API. Back up that downloaded file regularly.

Do not expose this application directly to the public Internet: the MVP intentionally has no authentication.
