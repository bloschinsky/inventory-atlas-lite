# Updater verified between two releases, and the administration commands corrected

- **Completed:** 2026-09-17
- **Version:** 0.5.6 (unchanged; documentation only)
- **Follows:** [`2026-09-16-proxmox-real-node-fixes.md`](2026-09-16-proxmox-real-node-fixes.md)

## Summary

The one scenario left unverified after the first Proxmox run — an upgrade between two different
releases — was executed on the same node, and a documentation error that made the updater look broken
was corrected.

### Upgrade 0.5.3 to 0.5.6 on the node

The container installed the day before was still on `0.5.3` while `v0.5.6` had been published. Running
`/usr/local/sbin/inventory-atlas-lite-update` upgraded it:

- the pre-update backup `inventory-20260917-100031.sqlite` was written before anything changed;
- the service was stopped only for the code swap and came back healthy;
- `GET /api/health` reports `0.5.6`, and the new page title from that release is live;
- both existing items survived, including one added through the UI between the two sessions;
- `/opt/inventory-atlas-lite/previous` holds the replaced `0.5.3` code for rollback;
- the service shows zero restarts.

`scripts/`, `deploy/` and `server/` are unchanged between `v0.5.3` and `v0.5.6`, so the `lib.sh` that
the `v0.5.3` installation carried was equivalent to the current one. An upgrade that does change the
deployment scripts still runs under the *old* updater and picks up the new one only on the following
run; that is inherent to replacing the tool with itself.

### `inventory-atlas-lite-update` was documented as working where it cannot

The guide said the administration commands could be run "either after `pct enter <CTID>` or as
`pct exec <CTID> -- <command>`" and listed the bare `inventory-atlas-lite-update`. That fails:

| Context | `PATH` | `/usr/local/sbin` |
| --- | --- | --- |
| `pct exec` | `/sbin:/bin:/usr/sbin:/usr/bin` | absent |
| `ssh root@ct '<command>'` | the same | absent |
| `pct enter`, interactive root login | `ENV_SUPATH` from `/etc/login.defs` | present |
| any non-root user | `ENV_PATH` from `/etc/login.defs` | absent |

The updater is installed into `/usr/local/sbin`, so only an interactive root shell finds it by name.
Everywhere else it fails with `Failed to exec "inventory-atlas-lite-update"`, which reads like a
missing installation rather than a `PATH` difference.

`docs/proxmox.md` now separates the two cases and spells out the full path for `pct exec`, matching
what the installer already prints when it finishes. The install location is unchanged: `/usr/local` is
where locally installed software belongs, and adding a second copy or a symlink under `/usr/sbin` to
paper over the `PATH` would be worse than naming the path.

The stale `v0.5.3` examples in the guide were refreshed to `v0.5.6`.

## Verification

```bash
npm run lint     # pass
npm test         # 16 pass, 1 skip (shellcheck not installed by default)
npm run build    # pass
npm run test:e2e # 8 passed
```

No code changed in this task, so the suites confirm the working tree is still clean rather than
covering anything new.
