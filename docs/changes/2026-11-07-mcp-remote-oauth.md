# Remote MCP access with OAuth (#66)

- **Completed:** 2026-11-07
- **Version:** 0.73.0
- **Branch:** `feature/66-mcp-remote-oauth`

## Summary

Phase 2.2 of the MCP work: the optional read-only adapter in `mcp/` can be used by remote MCP clients
over HTTPS without publishing Atlas. Details: `docs/features/mcp-remote-oauth.md`.

- **OAuth 2.1 in the adapter**, opt-in through `MCP_PUBLIC_URL` (HTTPS origin) and `MCP_STATE_DIR`.
  The MCP SDK's maintained handlers (`mcpAuthRouter`, `requireBearerAuth`) provide RFC 8414 and RFC
  9728 metadata, `/authorize`, `/token` with PKCE S256 verification, Dynamic Client Registration, and
  RFC 7009 revocation; `mcp/src/oauthProvider.js` adds the policy (one scope `inventory:read`, one
  resource `<public>/mcp`, constrained registration that keeps no fetchable client URL, single-use
  codes with replay revocation, rotating refresh tokens with reuse revocation, opaque hashed tokens).
  `mcp/src/authStore.js` keeps clients, codes, grants, and token hashes in `node:sqlite` with `0700`/
  `0600` permissions, outside Atlas's data. Every `/mcp` request, `initialize` included, needs a token;
  sessions are bound to their client.
- **Owner consent** (`mcp/src/consent.js`): a page naming the client, its return host, the scope, and
  the inventory; approval needs a one-time enrollment code printed on the host by
  `node src/cli.js enroll`, a per-request `__Host-` `SameSite=Strict` cookie, and the exact `Origin`.
  `cli.js clients` and `cli.js revoke <client_id>` list and revoke clients one by one.
- **Atlas:** `GET /api/auth/token` (new `token` access level in the route policy) describes the calling
  API token — id, scopes, effective permissions, expiry, never the secret.
- **Review follow-ups from #65 / PR #68:**
  - *Token permissions* — implemented: the adapter reads `/api/auth/token` at startup and on readiness
    and stops (exit 3, `token_overprivileged`) unless scopes and effective permissions are exactly
    `inventory:read`; no write probe.
  - *Atomic session capacity* — implemented: handshakes reserve a place before the asynchronous
    `connect()`; released on failure.
  - *Deadline including the queue* — implemented: the deadline starts before `acquire()`; timed-out and
    cancelled waiters leave the queue without leaking a slot.
  - *Compose topology* — implemented: `mcp/compose.yaml` carries a conspicuous "disposable test stack"
    warning; `mcp/deploy/compose.private.yaml` (existing Atlas, private) and `compose.remote.yaml`
    (existing Atlas, remote with Caddy) added; the `ATLAS_ALLOW_HTTP` private-network exception is
    spelled out.
  - *Duplicate result payloads* — reviewed, not changed: MCP 2025-11-25 asks tools with structured
    output to also return it as text, and results are already bounded; documented.
- **Deployment:** `mcp/deploy/Caddyfile` (publishes only the MCP and OAuth paths), `compose.remote.yaml`
  (Caddy, internal edge network, read-only adapter without capabilities, host ports, Atlas volume, or
  Docker socket), `remote.env.example`, and `atlas-mcp.service` (hardened systemd unit for a dedicated
  Proxmox LXC). The Dockerfile prepares the state directory.
- **Deferred:** Client ID Metadata Documents (would require fetching client-chosen URLs on a public
  endpoint; clients fall back to DCR). Real Claude/ChatGPT connectors and onboarding are #67.

## Review fixes (PR #72)

The security review found two blocking availability weaknesses on the public OAuth entry points; both
were confirmed in the code and fixed:

- **Anonymous registrations could fill the 20 global waiting-client slots for 24 hours.** Waiting
  clients now expire after 30 minutes, the capacity is 200, and a full table evicts the oldest waiting
  client instead of refusing the registration; approved and revoked clients are never evicted.
  `node src/cli.js prune` clears waiting clients at once.
- **The consent cap was checked before an await and every page read Atlas.** `show()` now reserves its
  place before the await and releases it whatever happens (also when the browser left), a client keeps
  at most three open requests (applied at insertion), the inventory name is one shared Atlas read
  cached for a minute, and `GET /authorize` has an explicit 30 per 15 minutes per address limit.
- Non-blocking notes: the documentation no longer claims the endpoint cannot be exposed without
  OAuth; it warns never to publish the unauthenticated Phase 2.1 listener, and it states the pinned
  MCP 2025-11-25 / SDK 1.32.2 level and when it is reviewed (#67).
- Regression tests in `mcp/test/oauth.test.js`: a flood of 240 registrations from 24 synthetic
  addresses after which the owner onboards a new client immediately, and 120 simultaneous
  `/authorize` requests from 12 addresses against a slow Atlas (bounded reservations, one Atlas read,
  predictable `503`, recovery, the per-address limit).

## Verification

- `npm run lint` — passed.
- `npm test` — 438 tests, 435 passed, 2 failed, 1 skipped: the two `test/landing.test.js` guide tests
  that also fail on a clean `master` on Windows (confirmed with `git stash`), not a regression.
  `test/auth.test.js` and `test/auth-policy.test.js` cover the new endpoint.
- `npm run build` — passed.
- `npm run mcp:test` — 58 tests passed, including `mcp/test/oauth.test.js` (in-process OAuth, 10
  tests), `mcp/test/remote.test.js` (real Atlas, adapter process, HTTPS proxy, the official SDK OAuth
  client), the session race, readiness, queue deadline, and configuration tests.
- `APP_VERSION=0.73.0 npm run test:e2e` — 310 passed, 1 failed: `condition-grading.spec.js` "the info button beside Condition opens the grading help…", unrelated to this change, which passed when the spec was rerun alone (3/3). Run with `E2E_API_PORT=3800
  E2E_CLOUD_STUB_PORT=3801 E2E_LANDING_PORT=4200`, because Windows reserves the default ports here).
- `node mcp/test/docker-remote-smoke.mjs inventory-atlas-lite:smoke` (Docker 29.7.2, Compose 5.5.1) — passed: OAuth over HTTPS through Caddy, Atlas and the adapter unreachable from the public side, the adapter without host ports, extra mounts, socket, or token, and the grant surviving a restart. `node mcp/test/docker-smoke.mjs inventory-atlas-lite:smoke` (Phase 2.1) — passed against the same image.
- Proxmox LXC: documented manual check in the feature document; not performed in this change.
