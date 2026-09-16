# CODEX TASK — Add a Proxmox One-Line LXC Installer

## Goal

Add a standalone Proxmox VE installer for **Inventory Atlas Lite**.

The user must be able to open the shell of a Proxmox VE node, run one command from the project README, and receive a working Inventory Atlas Lite instance inside a new LXC container.

Target user experience:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bloschinsky/inventory-atlas-lite/main/scripts/proxmox-install.sh)"
```

After a successful installation, the script must print a usable URL such as:

```text
Inventory Atlas Lite is ready:
http://192.168.1.145:3000
```

Implement this as a project-owned installer inspired by Proxmox Community Scripts. Do not submit it to the Community Scripts catalog and do not depend on their internal `build.func`, `install.func`, or other remotely changing implementation files.

---

## Core approach

Use the following deployment model:

```text
Proxmox VE host
└── unprivileged Debian LXC
    └── Node.js
        └── Inventory Atlas Lite
            └── SQLite database and photos
```

Do not use Docker inside the LXC. The application is small enough to run directly under Node.js, and Docker would add an unnecessary nested-container layer.

The installer must create a dedicated LXC for this application. Do not install the application directly on the Proxmox host.

---

## Repository assumptions

- Use the repository's actual GitHub owner and repository name. If they differ from `bloschinsky/inventory-atlas-lite`, update all generated URLs consistently.
- The one-line public installer assumes that the repository and release assets are publicly readable.
- Do not place GitHub tokens or other credentials in the README command, shell history, generated configuration, or logs.
- Production installation should use a tagged GitHub release or tag, not an arbitrary moving commit from `main`.
- Allow an explicitly documented development override that installs a requested ref such as `main`, but do not make that the production default.

---

## Required files

Add at least:

```text
scripts/
├── proxmox-install.sh
├── install.sh
└── update.sh

deploy/
└── inventory-atlas-lite.service
```

The exact names may change slightly if required by the repository, but keep the roles separate:

- `proxmox-install.sh` runs on the Proxmox VE host and creates/configures the LXC;
- `install.sh` runs inside the container and installs the application;
- `update.sh` safely updates an existing installation without replacing its data;
- the systemd unit runs the application automatically.

Do not add an uninstall command unless it can clearly identify the exact target container and requires explicit confirmation before destroying it. Deleting an LXC is outside the primary scope of this task.

---

## Default LXC configuration

Use lightweight defaults suitable for this application:

| Setting | Default |
| --- | --- |
| OS | Debian 13, with a documented Debian 12 fallback if necessary |
| Container type | Unprivileged LXC |
| Hostname | `inventory-atlas-lite` |
| CPU | 1 core |
| RAM | 1024 MiB |
| Swap | 512 MiB |
| Root disk | 8 GiB |
| Network bridge | `vmbr0` |
| IPv4 | DHCP |
| Application port | `3000` |
| Start on boot | Enabled |

Requirements:

- Allow the user to override at least CT ID, hostname, storage, bridge, disk size, CPU, RAM, and network settings through a small interactive prompt or documented environment variables/options.
- Prefer sensible defaults and keep the default installation path short.
- Do not require LXC nesting because Docker is not used.
- Do not silently overwrite or destroy an existing CT ID.
- Resolve and download an appropriate Debian LXC template through supported Proxmox commands.
- Work with common Proxmox storage configurations rather than assuming that `local-lvm` always exists.
- Display the selected configuration before creating the container.

Avoid recreating the full advanced wizard of Community Scripts. This installer should remain understandable and maintainable inside the Inventory Atlas Lite repository.

---

## Host-side installer requirements

`scripts/proxmox-install.sh` must:

1. Require root privileges.
2. Verify that it is running on a Proxmox VE host, for example by checking `pveversion` and required `pct`/`pveam` commands.
3. Use strict shell behaviour such as `set -Eeuo pipefail` and provide a useful error trap.
4. Validate all user-controlled values before passing them to Proxmox commands.
5. Select an unused CT ID by default, while allowing an explicit override.
6. Refuse to continue when the selected CT ID already exists.
7. Find or download the selected Debian LXC template.
8. Create an unprivileged container with the selected resources and networking.
9. Start the container and wait for networking to become available with a finite timeout.
10. copy or download the container-side installer and execute it inside the LXC;
11. verify the application health before reporting success;
12. print the container ID, IP address, application URL, update command, service status command, and log command;
13. clean temporary files on both success and failure.

If container creation fails midway, report the exact failure and the created CT ID. Do not automatically destroy an existing or partially created container unless the script created it during the current run and the cleanup behaviour is explicit and safe.

The script must not modify unrelated Proxmox host configuration.

---

## Container-side installation

Inside the LXC, install only the required runtime/build dependencies. Use the currently supported Node.js LTS version that is compatible with the project's `package.json`; pin the major version in the installer rather than silently following any future major release.

Install the application into:

```text
/opt/inventory-atlas-lite/app
```

Store persistent application data separately in:

```text
/var/lib/inventory-atlas-lite
```

Create a dedicated non-login system user, for example:

```text
inventory-atlas
```

The application process must not run as root.

Create a root-owned environment file such as:

```text
/etc/inventory-atlas-lite.env
```

with at least:

```ini
NODE_ENV=production
PORT=3000
DATA_DIR=/var/lib/inventory-atlas-lite
```

Set safe ownership and permissions so that:

- the service user can read the application code;
- the service user can write to the data directory;
- unrelated users cannot modify the code or environment file;
- updates cannot accidentally replace the persistent data directory.

Installation steps must include:

1. install the pinned Node.js LTS major and required native-build dependencies for `better-sqlite3` when needed;
2. download and verify the selected release/tag;
3. extract the application into a staging directory;
4. run `npm ci` using the committed lockfile;
5. run the existing production build;
6. remove development-only dependencies after the build where practical;
7. atomically place or replace the application code under `/opt/inventory-atlas-lite/app`;
8. create the data and configuration directories;
9. install and enable the systemd unit;
10. start the service and verify its health.

Do not copy `node_modules` from a release built on another operating system. Native dependencies must be installed or rebuilt inside the target Linux container.

---

## systemd service

Add a hardened but uncomplicated systemd unit for Inventory Atlas Lite.

It must include the equivalent of:

- dedicated `User` and `Group`;
- `WorkingDirectory=/opt/inventory-atlas-lite/app`;
- `EnvironmentFile=/etc/inventory-atlas-lite.env`;
- production start command using the existing server entry point;
- `Restart=on-failure`;
- startup after the network is available;
- automatic start on container boot;
- a reasonable stop timeout so SQLite can close cleanly.

Do not add Nginx, Caddy, TLS, a domain name, or authentication as part of this task. Express may listen directly on port `3000` on the trusted LAN.

---

## Health endpoint

Add a lightweight endpoint:

```http
GET /api/health
```

Expected successful response:

```json
{
  "status": "ok",
  "database": "ok",
  "version": "0.1.0"
}
```

Requirements:

- return HTTP `200` only when the server is running and a minimal SQLite query succeeds;
- return the application version from `package.json` or another single authoritative version source;
- do not expose filesystem paths, environment variables, stack traces, or other sensitive diagnostics;
- use this endpoint in the installer and updater readiness checks;
- keep existing API behaviour unchanged.

---

## Safe update command

Install a convenient command inside the LXC, for example:

```bash
inventory-atlas-lite-update
```

It must:

1. require root privileges;
2. determine the requested release, defaulting to the latest stable tagged release;
3. refuse invalid or unavailable versions before changing the current installation;
4. create a timestamped consistent SQLite backup before updating;
5. download and build the new release in a staging directory;
6. stop the systemd service only for the final code swap;
7. preserve `/var/lib/inventory-atlas-lite` and the environment file;
8. replace only the application code;
9. restart the service;
10. wait for `/api/health` with a finite timeout;
11. report the installed version and backup path;
12. restore the previous code and restart it if the new version fails its health check.

Prefer the application's existing SQLite backup endpoint or SQLite's supported online backup mechanism for the pre-update database backup. Do not rely on copying only `inventory.sqlite` while the application is actively writing in WAL mode.

Keep a small, documented number of previous update backups or document that the administrator is responsible for pruning them. Never delete user data merely to reclaim space.

---

## Release selection and integrity

The scripts must support:

- installation of the latest stable tagged release by default;
- installation/update to a specific version through a documented option or environment variable;
- deterministic download URLs;
- failure when a requested release cannot be resolved;
- a reasonable integrity check.

Prefer publishing a checksum such as `SHA256SUMS` with each release and verify the downloaded release archive against it. At minimum, use HTTPS, fail closed on download errors, and avoid executing partially downloaded content.

Do not use `npm install` without the lockfile for production deployment. Use `npm ci`.

---

## README changes

Add a concise **Install on Proxmox VE** section containing:

1. the one-line installation command;
2. a clear statement that it must be run in the shell of the Proxmox VE host as root;
3. default resource requirements;
4. how to override the main container settings;
5. where the application and database are stored;
6. how to update;
7. how to restart and inspect logs;
8. how to download an application-level backup;
9. a warning that the application has no authentication and must not be exposed directly to the public Internet;
10. a recommendation to use a trusted LAN or VPN/Tailscale for remote access.

Example administration commands:

```bash
systemctl status inventory-atlas-lite
systemctl restart inventory-atlas-lite
journalctl -u inventory-atlas-lite -f
inventory-atlas-lite-update
```

Document that full Proxmox backups protect the container, while the application's **Data / Backup** function creates a portable SQLite backup suitable for restoring the inventory elsewhere.

---

## Security requirements

- Do not expose the service through automatic router port forwarding.
- Do not automatically configure a public reverse proxy.
- Do not disable the Proxmox firewall globally.
- Do not use `curl | bash` inside implementation layers when the content can first be downloaded, validated, and then executed.
- Quote shell variables correctly.
- Avoid `eval`.
- Use temporary directories created with `mktemp -d` and clean them with traps.
- Never print tokens, passwords, or complete environment contents.
- Do not run the Node.js application as root.
- Do not grant unnecessary LXC features, device access, nesting, or privileged mode.

The README one-liner is allowed for convenience, but also document a safer inspect-first alternative:

```bash
curl -fsSLo proxmox-install.sh <installer-url>
less proxmox-install.sh
bash proxmox-install.sh
```

---

## Tests and verification

Add or extend automated tests to cover at least:

1. `/api/health` returns HTTP `200` when SQLite is usable;
2. the health response reports the correct application version;
3. the production build still succeeds;
4. all existing application tests still pass;
5. shell scripts pass `shellcheck` with documented exceptions only where necessary;
6. installer input validation rejects invalid CT IDs, resource values, bridge names, IP configuration, ports, and version strings;
7. the update script never places the database under the replaceable application directory;
8. a simulated failed update keeps the existing data and restores the previous application code;
9. script `--help` or equivalent documentation output works without making changes;
10. scripts fail safely when executed outside the expected Proxmox/container context.

If a real Proxmox test environment is unavailable to the implementing agent, do not pretend that full deployment was tested. In that case:

- test all non-Proxmox logic locally;
- provide a short manual smoke-test checklist;
- clearly state that a fresh Proxmox VE node test is still required before calling the installer production-ready.

Manual Proxmox smoke test:

1. run the README command on a supported Proxmox VE node;
2. accept default settings;
3. verify that a new unprivileged LXC is created and starts;
4. open the printed URL from another LAN device;
5. create a category and an item with a photo;
6. reboot the LXC and verify that the item remains;
7. run the update command and verify that data remains;
8. download and validate a portable SQLite backup;
9. reboot the Proxmox host or simulate container autostart and verify that the service returns.

---

## Non-goals

Do not add:

- Docker or Docker Compose inside the LXC;
- Kubernetes;
- a VM-based installer;
- a dependency on Proxmox Community Scripts internals;
- submission to the public Community Scripts catalog;
- automatic DNS, domain, TLS, reverse-proxy, or router configuration;
- application authentication or multi-user accounts;
- clustering or high availability;
- automatic restore of an entire Proxmox backup;
- automatic destructive container removal;
- a large general-purpose deployment framework.

---

## Acceptance criteria

The feature is complete when:

1. the README contains a working one-line command for a supported Proxmox VE host;
2. the command creates a new unprivileged Debian LXC without Docker;
3. Inventory Atlas Lite starts automatically and is reachable at the printed LAN URL;
4. the application runs as a dedicated non-root user under systemd;
5. code and persistent SQLite data are stored separately;
6. a container reboot preserves all data and returns the service automatically;
7. the updater installs a selected stable release without replacing data;
8. update failure rolls the application code back safely;
9. installer and updater verify `/api/health` before reporting success;
10. no existing application behaviour or tests regress;
11. security documentation clearly warns against direct public exposure;
12. the implementation is concise enough to maintain inside this repository.

## Main priority

Deliver a small, reliable, understandable homelab installation path. The result should feel like a Proxmox Helper Script to the user, while remaining owned by Inventory Atlas Lite and avoiding unnecessary deployment layers or destructive automation.
