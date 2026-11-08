# MCP tests: whole-secret token log check (#77)

- **Completed:** 2026-11-08
- **Version:** 0.74.1
- **Branch:** `bugfix/77-flaky-mcp-token-log-check`

## Summary

The release workflow of v0.74.0 failed in **Validate release** → `npm run mcp:test`, before the image
was pushed or the GitHub Release created, so 0.74.0 was never published. The failing test was
`mcp/test/remote.test.js` *an official MCP client authorizes over HTTPS through the proxy and reads
Atlas*, with `no Atlas or OAuth token in the log`.

The MCP tests check that the Atlas token never reaches the adapter's log by searching the log for
`token.split('_')[2]`. An Atlas token is `ial_<16 hex id>_<base64url secret>`, and a base64url secret
can itself contain `_`. In that case the fragment is only the text before the secret's first `_`:

- for about 1.5% of tokens it is empty, and `includes('')` is always true;
- for about 4.7% of tokens it is 1 to 3 characters long and can match ordinary log text.

The adapter never logged the token. The five checks in `mcp/test/remote.test.js`,
`mcp/test/integration.test.js`, and `mcp/test/acceptance.test.js` now compare against the whole
secret, `token.split('_').slice(2).join('_')`. No application or adapter code changed: 0.74.1 ships
the 0.74.0 features.

## Verification

- Measured the fragment lengths of 100,000 generated secrets: 1.54% empty, 4.65% of 1 to 3 characters.
- `npm run mcp:test`, three runs in a row: 85 passed each time.
- `npx eslint` on the three test files: passed.
- The rest of the code is unchanged since 0.74.0. Its local `npm run lint`, `npm test`, builds, and
  `npm run test:e2e` (314 passed) passed, and so did its release workflow's `lint`, `npm test`,
  `build`, and both end-to-end jobs.
- The full Linux run is the release workflow of v0.74.1.
