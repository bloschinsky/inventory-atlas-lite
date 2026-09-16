# Fix the branch in the installer URLs

- **Completed:** 2026-09-16
- **Version:** 0.5.1
- **Fixes:** [`2026-09-16-proxmox-one-line-installer.md`](2026-09-16-proxmox-one-line-installer.md)

## Summary

The Proxmox installer URLs pointed at a `main` branch that does not exist. The default branch of this
repository is `master`, so every documented raw URL returned HTTP 404 and the one-line installation
command from the README could not work at all.

The broken value came from the task specification and was copied without checking it against the
repository, including into the `v0.5.0` release.

Two places were affected:

- the documented commands in `README.md` and `docs/proxmox.md`, which a user copies by hand;
- `scripts/proxmox-install.sh`, where `INSTALLER_REF` defaults to the branch used to fetch `lib.sh`
  when the script runs without a checkout next to it. This is exactly the one-line path, so the
  installer aborted on its first download.

All of them now use `master`. The `APP_BRANCH` example in the guide was corrected the same way. The
task document in `docs/issues/` keeps the original wording, because it records what was specified.

## Regression test

`test/scripts.test.js` gained a check that collects every `raw.githubusercontent.com` ref from
`README.md`, `docs/proxmox.md` and `scripts/proxmox-install.sh`, adds the `INSTALLER_REF` fallback,
and asserts that each one resolves to a branch that exists in the repository. It was confirmed to
fail with `no such branch: main` before the fix.

## Verification

```bash
npm run lint     # pass
npm test         # 11 pass, 1 skip (shellcheck not installed by default)
npm run build    # pass
npm run test:e2e # 8 passed
```

`shellcheck --shell=bash --external-sources scripts/*.sh` reports no findings. The corrected URL was
checked against GitHub directly: the `master` path returns HTTP 200 where `main` returned HTTP 404.

The Proxmox deployment itself is still untested on a real node; the smoke-test checklist in the
first record remains outstanding.
