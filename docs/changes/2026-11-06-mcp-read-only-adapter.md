# Read-only MCP adapter, Phase 2.1

- **Completed:** 2026-11-06
- **Version:** 0.72.0
- **Issue:** #65 (TASK: MCP Phase 2.1 — Isolated Read-only MCP Server Core for Inventory Atlas Lite)

## Summary

- **New optional service `mcp/`.** It is a separate npm project (`mcp/package.json` and its own
  lockfile) with pinned `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7. It speaks MCP over
  Streamable HTTP at `/mcp` with stateful sessions, and it reaches Atlas only through GET requests to
  the existing REST API with a dedicated `inventory:read` bearer token. It never opens
  `inventory.sqlite` or `auth.sqlite`. Atlas core, its routes, its image, and the public demo are
  unchanged.
- **Six read-only tools:** `search_items` (`GET /api/items`), `get_item` (`GET /api/items/:id`),
  `list_categories` (`GET /api/categories` and `…/:id/fields`), `get_item_history`
  (`GET /api/items/:id/history` with Atlas's type, limit, and cursor), `get_inventory_summary`
  (`GET /api/dashboard`), and `get_item_location` (the item and its container chain, with own,
  inherited, or unknown placement and no invented coordinates). Each tool has strict zod schemas,
  read-only annotations, versioned results capped in size, and the same result as JSON text marked as
  untrusted data. Control and bidi characters are removed from text, and long text is cut.
- **Fail closed and bounded.** Configuration is validated strictly. A rejected token stops startup,
  and an unreachable Atlas only delays readiness. The Atlas client is GET-only, with no redirects or
  retries, one deadline per request, the caller's cancellation, a response size cap, and a
  concurrency limit with a bounded queue. Atlas errors become fixed, non-sensitive kinds. A client
  disconnect or `notifications/cancelled` aborts the Atlas request in flight.
- **Network boundary.** The adapter listens on `127.0.0.1:3100` by default, with the SDK's Host-header
  check against DNS rebinding and an Origin check. Any other address requires `MCP_ALLOWED_HOSTS`.
  Sessions are capped and expire when idle. `/healthz` and `/readyz` reveal neither the token nor the
  topology nor inventory data. Logs are JSON lines with the tool, outcome, and duration only, and
  token-shaped strings are redacted at every level.
- **Docker.** `mcp/Dockerfile` builds a non-root image from `mcp/` alone, and the release workflow
  does not publish it. `mcp/compose.yaml` adds the adapter under the `mcp` profile on an
  `internal: true` network with no host port, with its token as a Compose secret in the Git-ignored
  `mcp/secrets/`.
- **Root wiring.** The new scripts are `npm run mcp:install`, `mcp:start`, and `mcp:test`. ESLint
  covers `mcp/`, the root `.dockerignore` keeps `mcp/` out of the Atlas image context, and the release
  workflow runs the adapter tests in its validation job and the adapter's Docker smoke test on the
  release image (checked by `test/release.test.js`).
- **Documentation:** a new `docs/features/mcp-read-only-adapter.md` covers the architecture, tools,
  example invocations on a synthetic inventory (`node mcp/test/examples.mjs`), configuration, token
  provisioning, local and Docker use, threat boundaries, limitations, and Phase 2.2 notes. Also
  updated: the feature index, `authentication-and-access.md`, README (checks and a new section), the
  user guide in EN and UK (one paragraph in *Give a script access with an API token*), `AGENTS.md`,
  and the release history.

## Verification

- `npm run lint` — passed.
- `npm run mcp:test` — 38 tests passed: configuration, mapping, the Atlas client against a stub, the
  tools over the SDK's in-memory transport, the HTTP endpoint, and the integration with a real Atlas
  over the official Streamable HTTP client. The integration covers all six tools, pagination, no data,
  404, revoked and wrong tokens, `403` for writes, Host and Origin refusals, malformed JSON-RPC,
  cancellation, an Atlas restart, and logs without the token or inventory text.
- `node mcp/test/docker-smoke.mjs inventory-atlas-lite:mcp-smoke` — passed against the locally
  built Atlas image. Reads went through a client container on the internal network and survived an
  Atlas restart. The adapter had no host port, was on the internal network only, and kept the token
  out of its environment and log.
- `npm test` — 436 of 438 passed. The two failures are the known Windows-only guide tests in
  `test/landing.test.js`, which fail the same way on a clean `master`. In two earlier runs, while
  Docker Desktop was building images, one timing-sensitive server test failed (`auth.test.js` HTTPS
  once, `restore.test.js` once). Both passed alone and in the following full run.
- `npm run build` — passed.
- `APP_VERSION=0.72.0 npm run test:e2e` — 311 passed (`app` and `tour`). The run used `E2E_*_PORT` overrides
  because Docker Desktop had reserved the default ports 3456–3755 and 4448–4547 on this Windows host.
