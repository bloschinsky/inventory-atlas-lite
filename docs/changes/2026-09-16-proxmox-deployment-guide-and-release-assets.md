# Proxmox deployment guide and verified release assets

- **Completed:** 2026-09-16
- **Version:** 0.5.0 (unchanged; this finishes the same unreleased version line)
- **Follows:** [`2026-09-16-proxmox-one-line-installer.md`](2026-09-16-proxmox-one-line-installer.md)

## Summary

Follow-up to the Proxmox installer: the deployment documentation moved out of the README into its own
guide, and the release archive is now a published asset whose checksum the installer is required to
verify.

### Release assets and mandatory verification

A release publishes two assets:

| Asset | Contents |
| --- | --- |
| `inventory-atlas-lite-<tag>.tar.gz` | The application source for that tag, built with `git archive` |
| `SHA256SUMS` | The SHA-256 checksum of that archive |

`ial_fetch_source` in `scripts/lib.sh` now prefers the release asset over the GitHub-generated source
archive. When the asset exists, `SHA256SUMS` is mandatory: a missing checksum file and a mismatching
checksum both abort the installation. The GitHub source archive remains a fallback for tags published
without assets, and it keeps the previous behaviour of warning when no checksums are available.

The reason for the change is that GitHub generates its source tarballs on demand, so their bytes are
not a stable thing to publish a checksum for. An archive built and uploaded with the release is.

`.gitattributes` marks `.idea/` as `export-ignore` so IDE settings stay out of the release archive.

### Documentation split

- `docs/proxmox.md` is the new deployment guide: install command, inspect-first alternative, the
  container defaults table, the full override-variable table, the release and checksum details, the
  storage layout, the administration commands, updating and rollback behaviour, backups, and the
  security warnings.
- `README.md` keeps a short **Install on Proxmox VE** section with the one-line command, the default
  resources, and a link to the guide.
- `docs/README.md` documents the new convention: Markdown files directly in `docs/` are user-facing
  guides that are too long for the README.

### Test fix

`test/scripts.test.js` checked for uncommitted changes with `git status --porcelain` after running
`--help`, which failed as soon as the working tree had any unrelated modification. It now snapshots
the working tree before and after the `--help` runs and compares the two, which is what the check was
meant to assert.

## Verification

```bash
npm run lint     # pass
npm test         # 10 pass, 1 skip (shellcheck not installed by default)
npm run build    # pass
npm run test:e2e # 8 passed
```

`shellcheck --shell=bash --external-sources scripts/*.sh` reports no findings after the `lib.sh`
change. No Playwright test was added or changed: this task touches documentation and deployment only.

The Proxmox deployment itself is still untested; the smoke-test checklist in the previous record
remains outstanding.
