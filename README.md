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

A deliberately small, self-hosted inventory app for physical items. It uses Vue 3, Express, and one SQLite database containing all inventory data and photos. No authentication is included, so access should be limited to a trusted LAN or VPN/Tailscale network. Normal use is local; the optional AI Add Item feature contacts OpenAI only when the user requests photo analysis.

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

- [`docs/HOW-TO.md`](docs/HOW-TO.md) — quick how-to: first setup and the common inventory workflows.
- [`docs/features/README.md`](docs/features/README.md) — what the application currently does, one document per implemented feature.
- [`docs/README.md`](docs/README.md) — documentation layout, active tasks, and records of completed changes.

## Roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) lists the active planned features and their implementation order.

## Official releases

[GitHub Releases](https://github.com/bloschinsky/inventory-atlas-lite/releases) is the canonical
download page. Each stable `vMAJOR.MINOR.PATCH` release provides two server installation paths from
the same commit:

- `ghcr.io/bloschinsky/inventory-atlas-lite:<version>` for Docker hosts (`linux/amd64`);
- a checksummed source archive for the existing Proxmox VE installer, which builds and runs the
  application directly under Node.js and systemd in an unprivileged LXC.

### Docker

The image runs as a non-root user and stores its SQLite database under `/data`. Keep that directory
on a named volume so replacing the container or upgrading the image does not replace the inventory:

```bash
docker volume create inventory-atlas-data
docker run -d --name inventory-atlas-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v inventory-atlas-data:/data \
  -e DATA_DIR=/data \
  ghcr.io/bloschinsky/inventory-atlas-lite:0.8.0
```

Open `http://SERVER_IP:3000`. Set both `-p HOST_PORT:CONTAINER_PORT` and `-e PORT=CONTAINER_PORT`
when changing the container port. Use an explicit version for repeatable deployments; `latest`
tracks the newest stable release. Upgrade by pulling the new tag and recreating the container with
the same volume.

## Manual production run

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

## Creating an official release

Set the same stable version in `package.json` and `package-lock.json`, commit it, then push the tag:

```bash
git push origin master
git tag v0.8.0
git push origin v0.8.0
```

Push the commit containing the workflow to `master` before creating the tag, especially for the
first release. The tag-only GitHub Actions workflow validates the version and full test suite before
it publishes the Docker image, source archive, `SHA256SUMS`, and GitHub Release. A normal branch push
cannot create an official release. See
[`docs/features/github-release-pipeline.md`](docs/features/github-release-pipeline.md) for the
artifact contract and release checks.

## Data and backups

The database is created automatically at `data/inventory.sqlite`. It contains items, categories, fields, values, and original photo bytes. The **Data / Backup** page downloads a consistent SQLite snapshot using SQLite's backup API. Back up that downloaded file regularly.

AI configuration is managed in **Settings**. Its API key is stored separately as
`ai-settings.json` under `DATA_DIR`, is not returned to the browser after saving, and is not included
in SQLite backups. Back up or reconfigure this secret separately when moving an installation.

Do not expose this application directly to the public Internet: the MVP intentionally has no authentication.
