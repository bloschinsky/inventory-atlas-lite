# Read-only MCP adapter (Phase 2.1)

An optional, separate service in `mcp/` that lets a local Model Context Protocol client read the
inventory. It speaks MCP over **Streamable HTTP** with the official TypeScript SDK and turns each tool
call into GET requests to Atlas's own protected REST API, authenticated by a dedicated API token with
the `inventory:read` scope. Atlas does not need it, start it, or know about it.

```text
Local MCP client / protocol test
          │  MCP Streamable HTTP  (loopback or a private Docker network only)
          ▼
  atlas-mcp  (mcp/, its own process or container)
          │  GET /api/…   Authorization: Bearer <inventory:read token>
          ▼
  Atlas Express API → auth gate → existing services → inventory.sqlite
```

Phase 2.1 is deliberately small: no OAuth, no public endpoint, no write tools, and no AI calls. Public
HTTPS with OAuth is Phase 2.2; client setup guides are Phase 2.3; any mutation tool is Phase 3.

## Isolation

- The adapter never opens `inventory.sqlite` or `auth.sqlite`, never shares Atlas's data volume, and
  never uses a browser session. Every read goes through Atlas's auth gate and route policy, which stay
  the final authority. Atlas core is unchanged: every tool maps onto an existing read endpoint.
- `mcp/src/atlasClient.js` is the only network code. It has a `get()` method and nothing else: no
  method parameter, no caller-supplied URL. Path parts are encoded one by one, and redirects are
  refused so the token cannot travel elsewhere.
- `mcp/` is its own npm project (`mcp/package.json`, `mcp/package-lock.json`), so the Atlas build,
  image, release archive install, and the public demo get no new dependency. Pinned versions:
  `@modelcontextprotocol/sdk` **1.32.2** (bringing its own Express 5) and `zod` **4.6.7** for the tool
  schemas.

## Modules

| File | Responsibility |
| --- | --- |
| `mcp/src/index.js` | Process entry: configuration, startup token check, listener, shutdown. |
| `mcp/src/config.js` | Strict environment parsing; any invalid value stops the process (exit code 2). |
| `mcp/src/atlasClient.js` | GET-only Atlas client: bearer token, deadline, cancellation, size cap, concurrency and queue limits, no redirects or retries. |
| `mcp/src/errors.js` | `ToolError` kinds with fixed, non-sensitive messages, and the mapping of Atlas statuses. |
| `mcp/src/mapping.js` | Pure mapping of Atlas responses to versioned, bounded result shapes, text sanitizing, and location derivation. |
| `mcp/src/tools.js` | The six tool definitions (zod schemas, descriptions, read-only annotations), their handlers, and registration on any `McpServer`. |
| `mcp/src/httpServer.js` | Streamable HTTP endpoint with sessions, Host/Origin checks, `/healthz`, `/readyz`. |
| `mcp/src/logger.js` | JSON log lines with secret redaction. |

The transport, the Atlas client, the mapping, and the tool registration are independent, so Phase 2.2
can mount `registerTools()` behind an OAuth-protected transport without changing the tools.

## Tools

All tools carry `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and
`openWorldHint: false`. Input schemas refuse unknown keys (`additionalProperties: false`). An item is
named by its numeric id or its UUID; anything else (paths, signs, decimals, malformed UUIDs) is
refused before Atlas is called. Results are `structuredContent` plus the same JSON as text, prefixed
by a note that text values are user-entered data, never instructions. Every result has `version: 1`.

| Tool | Atlas endpoints | Input | Result |
| --- | --- | --- | --- |
| `search_items` | `GET /api/items` | `query` (≤ 200), `category_id`, `condition` (grade or `unset`), `lifecycle` (`active` default, `all`, `retired`), `sort` (`name`, `category`, `condition`, `location`, `created`, `updated`), `direction`, `page` (1–10000), `page_size` (1–25, default 10) | Compact rows (id, UUID, name, category, lifecycle, grade, New, effective location, container, Transferred To, `has_photo`, updated) and `page`, `page_size`, `total`, `pages`, `has_more`. Atlas's plain text search, not semantic search. |
| `get_item` | `GET /api/items/:id` | `item` | Description, category, condition, stored and effective location, container, contents (first 50 and a count), custom fields in typed form (boolean, number, color `{ key, hex }`, date, text), purchase data, serial number, open loan, retirement, `photo_count` (photos are never sent), Source URL, timestamps. |
| `list_categories` | `GET /api/categories`, `GET /api/categories/:id/fields` | optional `category_id` | Categories with item and field counts (up to 200), or one category with its field names and types. |
| `get_item_history` | `GET /api/items/:id/history` | `item`, `type` (`all`, `location`, `transfer`, `lifecycle`), `limit` (1–50, default 20), `cursor` | Recorded events newest first and `next_cursor` (Atlas's own cursor, passed back as `cursor`). Nothing is inferred. |
| `get_inventory_summary` | `GET /api/dashboard` | optional `category_id` | The Dashboard figures as Atlas computes them: active and retired counts, photo coverage, placement, added in 30 days, by category, condition, and location, field coverage, and only the days on which items were added. |
| `get_item_location` | `GET /api/items/:id`, then each container | `item` | `status` (`known`/`unknown`), effective `location` and `location_detail`, `location_source` (`item`, `outermost_container`, `none`), `inherited_from`, the stored values separately, `container_chain` outwards (up to 20, cycle-safe), an open loan, the retirement snapshot of a retired item, and `geocoordinates: null` — Atlas stores free text, not coordinates. |

Text values have control characters and Unicode bidirectional overrides removed and are cut at fixed
lengths (names 200, descriptions 2000, other text 300 code points), so one hostile or huge record
cannot flood a client's context or hide text.

### Errors

A failed call returns `isError: true` with `{ error: { kind, message, atlas_code?, detail?,
retry_after_seconds? } }`. The kinds are `invalid_input`, `not_found`, `auth_rejected` (missing,
revoked, or expired token, or a disabled owner), `forbidden` (also Atlas refusing plain HTTP:
`AUTH_HTTPS_REQUIRED`), `rate_limited` (Atlas `429`, or the adapter's own queue full),
`upstream_unavailable` (connection refused, timeout, `502`–`504`), `upstream_error`,
`response_too_large`, and `cancelled`. Messages are fixed text; Atlas's response body, the upstream
address, and stack traces are never passed on. Schema violations and unknown tools are answered by the
SDK as tool errors.

### Examples on a synthetic inventory

`node mcp/test/examples.mjs` starts a temporary Atlas with two items and prints these (abridged):

```jsonc
// search_items { "query": "camera", "page_size": 5 }
{ "version": 1, "items": [
    { "id": 1, "name": "Camera bag", "category": { "id": 1, "name": "Photo gear" }, "effective_location": "Hall closet",
      "effective_location_detail": "Top shelf", "container": null, "has_photo": false, "…": "…" },
    { "id": 2, "name": "Film camera", "condition_grade": "good", "effective_location": "Hall closet",
      "container": { "id": 1, "uuid": null, "name": "Camera bag" }, "…": "…" } ],
  "page": 1, "page_size": 5, "total": 2, "pages": 1, "has_more": false }

// get_item_location { "item": "<uuid of Film camera>" }
{ "version": 1, "item": { "id": 2, "name": "Film camera", "…": "…" }, "status": "known",
  "location": "Hall closet", "location_detail": "Top shelf", "location_source": "outermost_container",
  "inherited_from": { "id": 1, "name": "Camera bag", "…": "…" }, "stored_location": null,
  "container_chain": [ { "id": 1, "name": "Camera bag", "…": "…" } ], "container_chain_truncated": false,
  "on_loan": null, "retirement_snapshot": null, "geocoordinates": null,
  "note": "Locations in Atlas are free text entered by people, not geographic coordinates." }

// list_categories { "category_id": 1 }
{ "version": 1, "category": { "id": 1, "name": "Photo gear", "item_count": 2 },
  "fields": [ { "id": 1, "name": "Brand", "type": "text" } ], "fields_truncated": false }

// get_item { "item": 999 }  →  isError: true
{ "error": { "kind": "not_found", "message": "Atlas has no such record.", "atlas_code": "ITEM_NOT_FOUND" } }
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ATLAS_BASE_URL` | required | Atlas's address, `http` or `https`, without credentials, query, or fragment. |
| `ATLAS_API_TOKEN` / `ATLAS_API_TOKEN_FILE` | one required | The token, or a file holding only it (Docker/Compose secrets). Both at once is refused; a malformed value is refused without being echoed. |
| `MCP_HOST` | `127.0.0.1` | Listening address. Anything but loopback needs `MCP_ALLOWED_HOSTS`. |
| `MCP_PORT` | `3100` | Listening port. |
| `MCP_ALLOWED_HOSTS` | — | Extra accepted `Host` names, comma-separated (always accepted: `127.0.0.1`, `localhost`, `[::1]`). |
| `ATLAS_TIMEOUT_MS` | `10000` | One deadline per Atlas request, connection and answer together (500–60000). |
| `ATLAS_MAX_RESPONSE_BYTES` | `2097152` | Largest Atlas answer read (64 KiB–20 MiB); larger answers are cut off as `response_too_large`. |
| `ATLAS_MAX_CONCURRENCY` | `4` | Atlas requests at once (1–32). |
| `ATLAS_MAX_QUEUE` | `32` | Requests that may wait for a slot (0–1000); beyond it a call is `rate_limited`. |
| `MCP_MAX_SESSIONS` | `32` | Open MCP sessions (1–1000); a new one beyond it gets `503`. |
| `MCP_SESSION_IDLE_SECONDS` | `900` | Idle sessions are closed after this time (30–86400). |
| `MCP_LOG_LEVEL` | `info` | `error`, `warn`, `info`, or `debug`. |

## Provisioning the service token

1. Sign in as an administrator, open **Settings → Security & Access → API Access**, and create a token
   named for the adapter (for example *MCP adapter*) with **Access: Read-only** and an expiry.
2. Copy it once into the adapter's secret: an environment variable for a local process, or the file
   `mcp/secrets/atlas-mcp-token` for Compose (ignored by Git). Never commit it or put it in a URL.
3. Rotate by creating a new token, updating the secret, restarting the adapter, then revoking the old
   token. Revoking takes effect at once: every call answers `auth_rejected`.

A **Read and write items** token would work against Atlas, but the adapter offers no write tool; use
the read-only scope so Atlas itself refuses writes (`403`) whatever happens in the adapter.

## Running locally

```bash
npm run mcp:install
ATLAS_BASE_URL=http://127.0.0.1:3000 ATLAS_API_TOKEN=ial_… npm run mcp:start
# atlas-mcp listening on http://127.0.0.1:3100/mcp
```

Point a local MCP client, or the MCP Inspector (`npx @modelcontextprotocol/inspector`, transport
*Streamable HTTP*, URL `http://127.0.0.1:3100/mcp`), at that address. The endpoint has no client
authentication in this phase, so it must stay on loopback or a private container network.

### Lifecycle

- At startup the adapter reads `/api/capabilities` with its token. A token Atlas rejects stops the
  process (exit code 3) without a fallback to anonymous requests; an unreachable Atlas only delays
  readiness, and the adapter starts serving when Atlas comes up.
- `GET /healthz` answers `{ "status": "ok" }` while the process runs. `GET /readyz` answers `200 {
  "status": "ready" }` or `503 { "status": "not_ready", "reason": "<kind>" }` from the same read,
  cached for five seconds; neither reveals the token, the upstream address, or inventory data.
- Sessions are in memory (`Mcp-Session-Id`); a restart of the adapter ends them and clients
  initialize again. An Atlas restart does not end them: calls fail as `upstream_unavailable` meanwhile
  and work again in the same session.
- `notifications/cancelled` and a dropped connection abort the Atlas request in flight. Nothing is
  retried; a failure is reported once.
- `SIGTERM`/`SIGINT` close every session and the listener.

## Docker

`mcp/Dockerfile` builds a small image (`node:22-bookworm-slim`, production dependencies, non-root
`node` user, health check on `/healthz`) from `mcp/` alone; it is not published by the release
workflow in this phase. `mcp/compose.yaml` runs Atlas and, under the `mcp` profile, the adapter:

```bash
docker compose -f mcp/compose.yaml --profile mcp up -d --build
```

The adapter joins only `atlas-mcp-private`, an `internal: true` network: no host port, no route to the
internet, Atlas reachable as `http://atlas:3000`, and its token mounted as a Compose secret. Atlas sets
`ATLAS_ALLOW_HTTP=true` because the adapter reaches it over plain HTTP from a non-loopback container
address; Atlas's own port is published on the host's loopback only. To try the adapter from the same
machine, an override file may add the default network and `127.0.0.1:3100:3100` — never a public
binding.

## Threat boundaries

- **Trusted:** the operator who configures the adapter and holds the token; Atlas's auth gate.
- **Untrusted:** every MCP client request (validated by schema, bounded by limits) and every inventory
  text value (cleaned, cut, and labeled as data). Tool descriptions warn models that text is data.
- **Token:** never logged, never in a result or error, not an enumerable property of the client, only
  sent to `ATLAS_BASE_URL` (no redirects). Logs are scrubbed of anything shaped like `ial_…` or a
  Bearer value at every level.
- **Network:** loopback by default with Host-header (DNS rebinding) and Origin checks; a non-loopback
  address must name every accepted host. Anyone who can reach the endpoint can read the inventory, so
  Phase 2.1 is for the same machine or a private network only.
- **Atlas:** the token's scope is the real limit; the adapter adds no access of its own and offers no
  arbitrary fetch, path, SQL, administrative endpoint, AI call, photo bytes, or export.

Logs are one JSON line per event on stderr: session opened/closed, and per tool call the tool name,
JSON-RPC request id, session id, outcome kind, Atlas status and code, and duration — never arguments
or results.

## Limitations

- No client authentication or TLS on the MCP endpoint (Phase 2.2 adds OAuth and public HTTPS).
- Plain text search only; no semantic or vector search.
- `get_item_location` reads one item per container level (at most 20 levels).
- Photos are counted, never returned; there is no resource or prompt API.
- Sessions live in memory of one process; there is no shared session store.
- Atlas's response language for derived labels (`Other`, `Unknown`) is English.

## Notes for Phase 2.2

- Mount `registerTools()` per authenticated principal behind an OAuth-protected Streamable HTTP
  transport; replace the loopback-only rule with authenticated access and keep the Host/Origin checks.
- Keep the single service token toward Atlas, or move to per-user tokens; Atlas's route policy stays
  authoritative either way.
- Publish the adapter image from the release workflow once it has a public deployment story.

## Tests

- `mcp/test/config.test.js` — defaults, loopback-only listening, the host allowlist, token sources and
  malformed tokens (never echoed), address and limit validation.
- `mcp/test/mapping.test.js` — text cleaning, code-point truncation, hostile text kept as data,
  typed custom fields, compact rows, bounded details, own/inherited/unknown location, history, summary.
- `mcp/test/atlasClient.test.js` — against a local stub: GET only with the bearer token and encoded
  paths, every status mapped without body text, unreachable and slow upstream, non-JSON, refused
  redirects, declared and streamed size caps, the concurrency cap, the bounded queue, and cancellation
  while waiting and in flight.
- `mcp/test/tools.test.js` — over the SDK's in-memory transport: enum parity with Atlas, exactly six
  read-only tools with strict schemas, malformed inputs and an invented write tool refused with no
  Atlas call, argument mapping, the container walk with a cycle, not found, normalized errors, logs
  without inventory text, a huge answer bounded, and cancellation.
- `mcp/test/httpServer.test.js` — the HTTP endpoint in process: a client that disconnects mid-call
  aborts the Atlas request, the session cap, closing a session, health without Atlas, and readiness
  reporting only an error kind, cached.
- `mcp/test/integration.test.js` — a real Atlas with a synthetic Ukrainian/English inventory and the
  adapter as its own process, over the official client and Streamable HTTP: all six tools, pagination,
  empty results, 404, hostile and long text, repeated and concurrent calls, cancellation, `403` for
  writes with the token, a revoked token (`auth_rejected`), a wrong or missing token stopping startup,
  foreign Host and Origin, malformed JSON-RPC, unknown sessions, an oversized body, and recovery after
  an Atlas restart; the token and inventory text never appear in the log.
- `mcp/test/docker-smoke.mjs <atlas-image>` — the image on an internal Docker network beside a real
  Atlas container: reads from a client container, an Atlas restart, no host port, only the internal
  network, the token neither in the environment nor in the log. The release workflow runs it on the
  release image.

Run them with `npm run mcp:install` once, then `npm run mcp:test`; the release workflow runs both in
its validation job.
