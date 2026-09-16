# Fixes from the first real Proxmox VE run

- **Completed:** 2026-09-16
- **Version:** 0.5.3
- **Fixes:** [`2026-09-16-proxmox-one-line-installer.md`](2026-09-16-proxmox-one-line-installer.md)

## Summary

The installer was run for the first time on a real Proxmox VE node (PVE 9.1.7, x86_64, Debian 13
container). Two defects surfaced that no local test could have found, because both depend on the
Proxmox environment itself.

### Template selection ignored the architecture

`pveam available` lists the same template name for several architectures:

```text
debian-13-standard_13.6-1_amd64.tar.zst
debian-13-standard_13.6-1_arm64.tar.zst
```

The old code took `sort -V | tail -n 1`, which returns the `arm64` entry — confirmed on the node
itself. An x86_64 host would have created the container from an arm64 template.

`ial_resolve_template <version> <arch>` in `scripts/lib.sh` now filters by the architecture reported
by `dpkg --print-architecture`, and the error message names the architecture it looked for.

### Node.js was unreachable inside the container

`pct exec` runs commands with `PATH=/sbin:/bin:/usr/sbin:/usr/bin`. Node.js is installed under
`/usr/local`, so `npm` was not found by name, and calling `/usr/local/bin/npm` by absolute path failed
too because its shebang is `#!/usr/bin/env node` and `node` was not on `PATH` either. Every
installation aborted at `npm ci`.

`scripts/lib.sh` now prepends `/usr/local/bin` to `PATH` when it is missing, which covers `install.sh`
and `update.sh` alike.

Both fixes have regression tests in `test/scripts.test.js`: template resolution is checked against a
stubbed `pveam` that reproduces the real catalogue, including that an unavailable architecture
resolves to nothing, and the `PATH` handling is checked from a minimal `pct exec` style `PATH`,
including that an existing entry is not duplicated.

## Verification on the node

A container was created and the application installed, then checked from another machine on the LAN:

- `pct create` produced `unprivileged: 1`, `onboot: 1`, no `features`, 1 core, 1024 MiB, 512 MiB swap,
  an 8 GiB disk on `local-lvm`, DHCP on `vmbr0`, exactly as configured;
- the storage, the next free CT ID and the template were resolved without any input;
- `better-sqlite3` compiled in the container and the Vite build completed;
- `GET /api/health` returns `{"status":"ok","database":"ok","version":"0.5.3"}` and the UI answers 200;
- the service runs as `inventory-atlas`, not root;
- `/opt/inventory-atlas-lite/app` is `root:root 755`, `/var/lib/inventory-atlas-lite` is
  `inventory-atlas:inventory-atlas 750`, `/etc/inventory-atlas-lite.env` is `root:inventory-atlas 640`;
- no `*.sqlite` file exists anywhere under `/opt/inventory-atlas-lite`;
- a category and an item were created, the container was rebooted, the service came back on its own
  and the item was still there;
- the backup endpoint returned a valid SQLite file containing the item, with `integrity_check` `ok`.

The updater was first run against the `v0.5.2` installation and failed at `npm ci`, because the
`lib.sh` installed next to the application still came from that release and predates the `PATH` fix.
It failed in the right place: the download and build happen in staging, so the service was never
stopped, stayed healthy, and the data was untouched.

After `v0.5.3` was published, the whole path was repeated from the README one-line command on a fresh
container, and the updater was run there:

- it wrote `inventory-20260916-135803.sqlite` to the backup directory before changing anything;
- it stopped the service only for the code swap, restarted it, and waited for `/api/health`;
- it reported the installed version and the backup path;
- the seeded item survived, `/opt/inventory-atlas-lite/previous` holds the replaced code for
  rollback, and the service shows zero restarts;
- `--version 'v1.0.0; id'` is rejected as an invalid version, `--version v9.9.9` fails on the
  download, and in both cases the running service was left alone.

Two things are still unobserved on real hardware: an upgrade between two different releases, and the
rollback that a failed health check triggers. The rollback logic itself is covered by the test that
exercises `ial_install_code` and `ial_rollback_code`.

## Local checks

```bash
npm run lint     # pass
npm test         # 14 pass, 1 skip (shellcheck not installed by default)
npm run build    # pass
npm run test:e2e # 8 passed
```

`shellcheck --shell=bash --external-sources scripts/*.sh` reports no findings.

## Note on the raw URL cache

`raw.githubusercontent.com` served a stale `scripts/lib.sh` for several minutes after the fix was
pushed, which made the first retry look like the fix had not worked. Re-fetching the same file by
commit SHA returned the new content immediately. Worth remembering when testing a change to the
installer right after pushing it.
