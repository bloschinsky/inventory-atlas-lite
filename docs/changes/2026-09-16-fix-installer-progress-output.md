# Keep installer progress output out of captured values

- **Completed:** 2026-09-16
- **Version:** 0.5.2
- **Fixes:** [`2026-09-16-proxmox-one-line-installer.md`](2026-09-16-proxmox-one-line-installer.md)

## Summary

`ial_log` wrote its progress lines to stdout. `ial_fetch_source` prints the path of the extracted
release on stdout as its return value, and both `install.sh` and `update.sh` read that path with
`SOURCE=$(ial_fetch_source ...)`. The capture therefore contained the two progress lines followed by
the path, and the next step failed on a directory name that did not exist.

This made every installation abort immediately after the release was downloaded and verified.

`ial_log` now writes to stderr, like `ial_warn` and `ial_die` already did. Progress is still shown on
the terminal and still forwarded through `pct exec`; it simply no longer lands in a captured value.

The bug was found by running `ial_fetch_source` against the published `v0.5.1` release instead of
reasoning about it, which is also how the fix was confirmed: the captured value is now exactly
`/tmp/.../source`, and `ial_app_version` reads `0.5.1` from it.

## Regression test

`test/scripts.test.js` gained a check that `ial_log` and `ial_warn` write nothing to stdout, that
both still reach stderr, and that a `$( )` capture around a logging helper returns only the payload.
It was confirmed to fail against the previous `lib.sh`.

## Verification

```bash
npm run lint     # pass
npm test         # 12 pass, 1 skip (shellcheck not installed by default)
npm run build    # pass
npm run test:e2e # 8 passed
```

`shellcheck --shell=bash --external-sources scripts/*.sh` reports no findings.

The download path was exercised against the live GitHub release: `ial_latest_tag` resolves the tag,
`ial_fetch_source` downloads the release asset, verifies it against `SHA256SUMS`, extracts it, and
returns a usable directory containing the expected `scripts/` and `deploy/` contents.

The Proxmox deployment itself is still untested on a real node; the smoke-test checklist in the first
record remains outstanding.
