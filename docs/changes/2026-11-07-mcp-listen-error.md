# MCP adapter listen error

- **Completed:** 2026-11-07
- **Version:** 0.72.1
- **Issue:** #69 (BUG: MCP adapter crashes with a TypeError when its port cannot be bound)

## Summary

- **Cause.** Express 5 `app.listen(port, host, callback)` also registers the callback for the
  server's `error` event. When the port could not be bound, the "listening" callback ran with the
  error, read `listener.address()` (which is `null`), and crashed with a `TypeError` before the
  adapter's own `cannot listen` handler ran. This was found in a live check of 0.72.0 on Windows,
  where the default port 3100 lies inside a range reserved by the system (3069–3168).
- **Fix.** `mcp/src/index.js` now creates the HTTP server itself and listens with separate
  `listening` and `error` handlers. The `listening on …/mcp` line appears only once the port is
  bound. A failure logs one `cannot listen` line with the error code, host, and port, and exits
  with the new exit code 4.
- **Documentation.** `docs/features/mcp-read-only-adapter.md` describes the behavior, exit code 4,
  and the Windows reserved port ranges. It also lists the new test. The release history has a
  0.72.1 entry.

## Verification

- `mcp/test/process.test.js` (new) starts the adapter on a port another process already holds. It
  checks the `cannot listen` line with `EADDRINUSE`, host, and port, exit code 4, no stack trace, no
  `listening on` line, and the token kept out of the log. A free port is announced only once it is
  bound. Without the fix the first test fails.
- `npm run lint` — passed.
- `npm run mcp:test` — 40 tests passed.
- `npm test` — 435 of 438 passed, 1 skipped (shellcheck is not installed on this host). The two
  failures are the known Windows-only guide tests in `test/landing.test.js`, which fail the same way
  on a clean `master`.
- `npm run build` — passed.
- A live check of the adapter against Atlas 0.72.0 on another machine passed all six tools before
  this fix; the fix changes only the listener.
