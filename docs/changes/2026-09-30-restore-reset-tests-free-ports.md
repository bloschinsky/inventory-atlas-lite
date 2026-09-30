# Restore and reset tests use free server ports

- **Completed:** 2026-09-30
- **Version:** 0.46.1

## Summary

- The v0.46.0 Release workflow failed in `npm test`: in `test/restore.test.js`, *staged uploads from
  an interrupted run are cleared when the server starts* reported *Server exited before becoming
  ready* when it restarted the server. The failure was unrelated to the checklist change of 0.46.0.
- Cause: the same port collision fixed for three other test files in 0.44.1. `test/restore.test.js`
  and `test/reset.test.js` still spawned the server on a fixed random port (33000–36000), inside the
  Linux ephemeral range, while `node --test` runs the files in parallel; a socket of another test could
  already hold the port, and the server's discarded output hid the `EADDRINUSE` exit.
- Both files now start and stop the server through the shared `test/serverProcess.js` (`PORT=0`, the
  bound port read from the listening line, stderr visible). Their own start/stop helpers were removed;
  no test logic changed. No API test starts the server on a chosen port any more.
- The Checklists Phase 1 record now states the Playwright result of the tagged `v0.46.0` commit
  (118 passed); the 0.46.1 release-history entry notes the fix.

## Verification

- `npm run lint` — passed.
- `npm test` — 222 tests: 221 passed, 1 skipped (shellcheck is not installed locally), run twice.
- `npm run build` — passed.
- `npm run test:e2e` with `APP_VERSION=v0.46.1` (the uncommitted working copy still sat on the
  `v0.46.0` tag) — 118 passed.
