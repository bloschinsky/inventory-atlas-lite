# API tests use free server ports

- **Completed:** 2026-09-29
- **Version:** 0.44.1

## Summary

- The v0.44.0 Release workflow failed in `npm test`: in `test/e2e.test.js`, *batch item import creates
  the whole batch atomically and keeps it over a restart* reported *Server exited before becoming
  ready* when it restarted the server. The failure was unrelated to the hierarchy change of 0.44.0.
- Cause: `test/e2e.test.js`, `test/dashboard.test.js`, and `test/cloud-backup.test.js` each spawned the
  server on a fixed random port (32000–37000). `node --test` runs the files in parallel, and those
  ports lie inside the Linux ephemeral range (32768–60999), so any outgoing or `listen(0)` socket of a
  parallel test could already hold the chosen port; the server then exited with `EADDRINUSE`. The
  server's output was discarded, which hid the reason.
- New `test/serverProcess.js` shared by the three files: it starts the server with `PORT=0`, so the
  operating system assigns a free port, reads the bound port from the listening line, keeps the
  server's stderr visible, and stops it with `SIGTERM`. The duplicated start/stop helpers were
  removed.
- `server/src/index.js` now logs the bound port (`server.address().port`) instead of the requested
  one; with a normal `PORT` the line is unchanged.
- `AGENTS.md` lists the new helper; the 0.44.1 release-history entry notes the fix.

## Verification

- `npm run lint` — passed.
- `npm test` — 206 tests: 205 passed, 1 skipped (shellcheck is not installed locally), run twice.
- `npm run build` — passed.
- `npm run test:e2e` — 113 passed on the tagged commit. (Before committing, the What's New and Version History specs failed only because Vite takes the version from the `v0.44.0` tag on `HEAD` while the bump is uncommitted.)
