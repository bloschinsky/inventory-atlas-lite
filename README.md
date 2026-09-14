# Simple Personal Inventory

A deliberately small, self-hosted inventory app for physical items. It uses Vue 3, Express, and one SQLite database containing all data and photos. No authentication or Internet connection is required at runtime; access should be limited to a trusted LAN or VPN/Tailscale network.

## Requirements

- Node.js 20 or newer
- npm

## Install and develop

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The development server listens on the local network as well.

## Production

```bash
npm run build
npm start
```

Open `http://SERVER_IP:3000`. Set `PORT` to change the port. Set `DATA_DIR` to place persistent data in another directory. These environment variables work on Linux/macOS and in PowerShell (`$env:PORT=3001`).

## Data and backups

The database is created automatically at `data/inventory.sqlite`. It contains items, categories, fields, values, and original photo bytes. The **Data / Backup** page downloads a consistent SQLite snapshot using SQLite's backup API. Back up that downloaded file regularly.

Do not expose this application directly to the public Internet: the MVP intentionally has no authentication.
