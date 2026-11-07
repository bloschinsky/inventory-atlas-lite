# Remote MCP access with OAuth (Phase 2.2)

The optional read-only MCP adapter (`mcp/`, [Phase 2.1](mcp-read-only-adapter.md)) can be reached by
remote MCP clients over HTTPS. Setting `MCP_PUBLIC_URL` turns on a standards-based **OAuth 2.1**
authorization server and protected resource inside the adapter, and the shipped remote recipe
(`mcp/deploy/compose.remote.yaml`, the Caddyfile, the LXC unit) always sets it. Atlas's REST API and
web interface stay private, the tools stay read-only, and the adapter still reaches Atlas only with
its own `inventory:read` API token.

> **Never publish the Phase 2.1 listener.** Without `MCP_PUBLIC_URL` the adapter has no client
> authentication. It can still listen on a non-loopback address (`MCP_HOST=0.0.0.0` with
> `MCP_ALLOWED_HOSTS`) for a private container network, and that mode must never be reachable from a
> LAN you do not control or the Internet: its Host and Origin checks guard against DNS rebinding, they
> are not authentication.

```text
External MCP client (untrusted cloud)
        │ HTTPS + OAuth access token (bound to https://mcp.example.com/mcp, scope inventory:read)
        ▼
Caddy (TLS)  — publishes only /mcp, the OAuth endpoints, and their metadata; everything else 404
        │ private network (Docker: internal `mcp-edge`; LXC: loopback)
        ▼
atlas-mcp  — OAuth guard → MCP session → six read-only tools
        │ private network; Authorization: Bearer <inventory:read Atlas token>
        ▼
Atlas REST API (private) → auth gate → inventory
```

The two credentials never meet: an OAuth token is checked only by the adapter and is never sent to
Atlas (no token passthrough), and the Atlas token is never sent to a client, written into metadata,
URLs, or logs, or derived from anything a client sends.

Specification and SDK: the adapter deliberately implements MCP **2025-11-25** (authorization and
Streamable HTTP transport) through the pinned `@modelcontextprotocol/sdk` **1.32.2** (the 1.x line),
whose server negotiates protocol versions up to 2025-11-25. Newer specification revisions and the SDK's
2.x line are not adopted here; moving to them is a separate change with its own interoperability
tests. Compatibility with current Claude and ChatGPT connectors is checked in Phase 2.3 (#67), and the
pinned level should be reviewed whenever a connector stops negotiating 2025-11-25 or the 1.x line stops
receiving security fixes. Remote access needs **Node.js 22.13+** (the OAuth store uses `node:sqlite`);
the private Phase 2.1 mode still runs on Node.js 20.19+.

## Security decision record

**Context.** One owner self-hosts Atlas and wants Claude (and, where the account allows, ChatGPT) to
read the inventory from the vendor's cloud. MCP's authorization specification makes the MCP server an
OAuth 2.1 resource server: clients discover an authorization server through Protected Resource
Metadata (RFC 9728), register (Dynamic Client Registration, RFC 7591, or Client ID Metadata
Documents), run the Authorization Code flow with PKCE S256, and send tokens bound to the resource
(RFC 8707).

**Options.**

1. *An external OAuth/OIDC provider* (Keycloak, Authentik, a hosted IdP) as the authorization server,
   the adapter as a pure resource server validating its JWTs. Maintained and feature-rich, but a
   second large service to run, secure, and back up for one person; DCR for public MCP clients must
   be configured per provider, and JWT validation adds key fetching and rotation to the adapter.
2. *A minimal dedicated authorization server inside the adapter*, built from the MCP SDK's maintained
   server components: `mcpAuthRouter` (authorization server metadata, `/authorize`, `/token` with
   PKCE verification, `/register`, `/revoke`) and `requireBearerAuth`, behind a small provider that
   only decides policy and stores state.

**Decision: option 2.** No cryptography, grant handling, client registration parsing, or token
endpoint logic is written here: the SDK handlers parse and validate the protocol messages, verify
PKCE, and apply per-address rate limits. The adapter's code is policy — one scope, one resource, who
may approve — and storage. Tokens are opaque 256-bit random values stored only as SHA-256 hashes, so
there is no signing key to protect or rotate, nothing for a client to verify locally, and revocation
takes effect on the next request. An operator who prefers an external IdP can still put one in front
later; the tools and the Atlas client do not change.

**Owner authentication.** The adapter keeps no password and does not integrate Atlas's account
login: relaying Atlas passwords through an Internet-facing service, or handing Atlas session cookies
to an external flow, would widen Atlas's attack surface to protect a read-only grant. Instead the
owner proves themselves with a **one-time enrollment code** printed on the adapter's host
(`node src/cli.js enroll`), the same pattern as Atlas's own setup and recovery codes: 100 bits, valid
once for ten minutes, only the latest code works, stored as a hash. Possession of a shell on that host
is the trust anchor.

**Client registration.** Dynamic Client Registration is supported because current Claude and ChatGPT
connectors use it, constrained: 1–5 redirect URIs, HTTPS or loopback HTTP only (no fragments,
credentials, or other schemes), only the `authorization_code`/`refresh_token` grants and the `code`
response type, only the `inventory:read` scope. URLs a client offers (`logo_uri`, `jwks_uri`,
`client_uri`, …) are dropped, never fetched. A registered client can do nothing until the owner
approves it. Because registration is anonymous, waiting clients can never lock the owner out: they
expire after 30 minutes, and once 200 are waiting a new registration **evicts the oldest waiting
one** instead of being refused. A flood therefore only churns other waiting registrations; to push out
a legitimate one, an attacker would have to register 200 clients in the minutes before the owner
approves it, past the per-address registration limit. Approved and revoked clients are never evicted,
and `node src/cli.js prune` clears every waiting client at once. **Client ID
Metadata Documents are not supported** (deferred): they require fetching a client-chosen URL during
authorization, which reopens SSRF on a public endpoint; clients fall back to DCR when the metadata
does not advertise them. `client_id_metadata_document_supported` is absent from the metadata.

**Consequences.** One process holds both roles, so its OAuth store (`MCP_STATE_DIR`) is a secret to
protect like a password database. Losing it only means re-approving clients. There is no consent UI
in Atlas and no per-user mapping: every approved client gets the same `inventory:read` view through
the one restricted Atlas token.

## Configuration (remote access)

Everything from the [Phase 2.1 table](mcp-read-only-adapter.md#configuration) applies, plus:

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_PUBLIC_URL` | — | Turns remote access and OAuth on. An origin only (`https://mcp.example.com`): the issuer, and with `/mcp` the resource every token is bound to. HTTPS is required; plain `http` only on a loopback host for tests. Its host name becomes an accepted `Host` header. |
| `MCP_STATE_DIR` | required with `MCP_PUBLIC_URL` | Private directory of the OAuth store `mcp-auth.sqlite` (directory `0700`, file `0600`). Never inside Atlas's data directory. |
| `MCP_TRUST_PROXY` | none | The reverse proxy's addresses or CIDR ranges (or `loopback`, `linklocal`, `uniquelocal`) whose `X-Forwarded-For` names the client address for rate limits. Never `true`. |
| `MCP_ACCESS_TOKEN_SECONDS` | `3600` | Access token lifetime (300–86400). |
| `MCP_REFRESH_TOKEN_DAYS` | `30` | Refresh token lifetime (1–90); each refresh issues a new one. |

The issuer, endpoint, and resource URLs are built from `MCP_PUBLIC_URL` only, never from a request's
`Host`, `X-Forwarded-Host`, or `Forwarded` header. A `Host` that is not the public name or loopback is
refused before anything else (DNS rebinding).

## Endpoints

| Path | Public | Purpose |
| --- | --- | --- |
| `POST/GET/DELETE /mcp` | token | Streamable HTTP. Every request — `initialize`, `tools/list`, `tools/call`, the event stream, session end — needs `Authorization: Bearer <access token>`. Without one: `401` with `WWW-Authenticate: Bearer error="invalid_token", …, scope="inventory:read", resource_metadata="…/.well-known/oauth-protected-resource/mcp"`. |
| `GET /.well-known/oauth-protected-resource/mcp` (and without `/mcp`) | yes | RFC 9728 metadata: `resource`, `authorization_servers`, `scopes_supported`. |
| `GET /.well-known/oauth-authorization-server` | yes | RFC 8414 metadata: `code` only, `S256` only, `authorization_code` and `refresh_token`, `none`/`client_secret_post`. |
| `POST /register` | yes | Dynamic Client Registration with the limits above; 20 per hour and address. |
| `GET /authorize` | yes | Validates client, redirect URI, scope, resource, and PKCE, then shows the consent page; 30 per 15 minutes and address. |
| `POST /consent` | yes | The owner's decision (below); 30 per 15 minutes and address. |
| `POST /token` | yes | Code exchange (PKCE verified by the SDK) and refresh; 50 per 15 minutes and address. |
| `POST /revoke` | yes | RFC 7009; revoking either token of a pair ends its grant. |
| `GET /healthz`, `/readyz` | no | Probes for Docker/systemd; the reverse proxy does not publish them. |

`/mcp` is also limited to 300 requests per minute and address. Request bodies are capped (100 KB JSON
on the adapter, 256 KB at Caddy); request and header timeouts stay as in Phase 2.1.

### Consent

`/authorize` refuses an unknown client or an unregistered redirect URI with a direct `400` (never a
redirect), and redirects `invalid_scope`, `invalid_target` (a resource other than this `/mcp`), or
`invalid_request` (no PKCE, or not S256) back to the client. Otherwise it shows a page naming the
client and its `client_id`, the host it returns to, the scope in words, and the target inventory
(Atlas's database name and the resource URL). The page sends `Content-Security-Policy` with
`frame-ancestors 'none'` and a nonce for its only style, `X-Frame-Options: DENY`, `no-store`, and no
referrer, and sets an `HttpOnly`, `SameSite=Strict`, `Secure` `__Host-` cookie bound to this one
request.

The decision is accepted only with that request id, the same browser's cookie, an `Origin` equal to
`MCP_PUBLIC_URL`, and — to approve — a valid enrollment code. Five wrong codes end the request with
`access_denied`; **Deny** redirects `access_denied` with the client's `state`. Approval redirects to
the registered URI with a single-use authorization code (60 seconds, bound to the client, redirect
URI, PKCE challenge, scope, and resource) and marks the client approved.

Pending requests live in memory for ten minutes, at most 50. A request reserves its place before the
page is prepared, so simultaneous requests can never exceed the limit; beyond it the page answers
`503` until requests are decided or expire. One client holds at most three open requests (a newer one
replaces its oldest), so a single registration cannot fill the table. The inventory name on the page
comes from one shared Atlas read cached for a minute, so anonymous page views never multiply into
Atlas traffic.

### Tokens

- **Access token** `amcp_at_…`: one hour by default, accepted only if active, of this server, for this
  resource, with `inventory:read`, and its grant and client are not revoked.
- **Refresh token** `amcp_rt_…`: rotated on every use (the previous access token ends too). A spent
  refresh token presented again revokes the whole grant; so does redeeming an authorization code a
  second time. A code accepts at most three token requests, so guessing PKCE verifiers burns it.
- A refresh cannot add scopes or change the resource. Atlas API tokens, ID-token-shaped strings, and
  any other bearer value are refused with `401`.
- An MCP session belongs to the client that opened it: another client's token gets `404` for its
  session id, and a revoked or expired token loses the session at the next request.

## The adapter's own Atlas token

At startup and for every readiness check the adapter reads `GET /api/auth/token`, a new Atlas
endpoint that describes the calling API token — its id, scopes, effective permissions (scopes limited
by the owner's role), and expiry — and never its secret (see
[authentication-and-access.md](authentication-and-access.md)). The adapter refuses to run (exit code
3, `token_overprivileged`) unless both the scopes and the effective permissions are exactly
`inventory:read`; it never probes access by attempting a write. A revoked token turns readiness into
`503 auth_rejected` and every tool call into `auth_rejected` while OAuth keeps working, so clients see
a safe denial. An Atlas older than 0.73.0 answers `403`, and the adapter does not start.

## Operator guide

### 1. Provision the Atlas token

In Atlas, **Settings → Security & Access → API Access → Create token**: name it *MCP adapter*, Access
**Read-only**, an expiry you will rotate before. Copy it once into the adapter's secret file
(`mcp/secrets/atlas-mcp-token` for Docker, `/etc/atlas-mcp/atlas-token` for the LXC), alone on its
line. It is never an environment value, command argument, or URL.

### 2a. Docker Compose (`mcp/deploy/compose.remote.yaml`)

For an Atlas you already run anywhere the Docker host can reach:

```bash
cp mcp/deploy/remote.env.example mcp/deploy/.env   # MCP_DOMAIN=mcp.example.com, ATLAS_BASE_URL=https://atlas.home.example
docker compose -f mcp/deploy/compose.remote.yaml up -d --build
docker compose -f mcp/deploy/compose.remote.yaml logs atlas-mcp   # "atlas-mcp listening …", ready: true
```

Caddy publishes ports 80 and 443, obtains a public certificate for `MCP_DOMAIN` (DNS must point at the
host), and forwards only the published paths over the internal `mcp-edge` network. The adapter has no
host port, a read-only root file system, no capabilities, no Atlas volume or Docker socket, and one
named volume for its OAuth store. Its `atlas-upstream` network is how it reaches Atlas: restrict it
with the host firewall to Atlas's address and port, or, if Atlas runs in Docker on the same host, join
Atlas's network instead (commented in the file).

Which Compose file is which:

| File | Starts | Use |
| --- | --- | --- |
| `mcp/compose.yaml` | a **new, empty** Atlas with its own `atlas-data` volume, plus the adapter under the `mcp` profile | a disposable reference or test stack; it does not connect to the Atlas you already run |
| `mcp/deploy/compose.private.yaml` | the adapter only, for an existing Atlas, published on `127.0.0.1:3100` | Phase 2.1 private use on the same machine; no OAuth, never on a LAN or public address |
| `mcp/deploy/compose.remote.yaml` | Caddy and the adapter in OAuth mode, for an existing Atlas | remote clients over HTTPS |

`ATLAS_ALLOW_HTTP=true` on an Atlas lets it accept API tokens over plain HTTP from non-loopback
addresses. It is acceptable only where that hop is a private container network or a LAN segment you
control (as in `mcp/compose.yaml`'s internal network); it never makes an Internet-reachable plain
HTTP Atlas acceptable. When the adapter and Atlas are on different machines, give Atlas HTTPS and use
an `https://` `ATLAS_BASE_URL`.

### 2b. Proxmox LXC (dedicated container next to Atlas)

1. Create an unprivileged Debian 12 LXC `atlas-mcp` next to the Atlas container. Install Node.js 22
   (NodeSource or the Debian backports package) and Caddy (`apt install caddy`).
2. Copy the repository's `mcp/` directory to `/opt/atlas-mcp` and run `npm ci --omit=dev` there.
   Create the user: `useradd --system --home /var/lib/atlas-mcp --shell /usr/sbin/nologin atlas-mcp`.
3. `install -d -m 750 -o root -g atlas-mcp /etc/atlas-mcp`; write the token to
   `/etc/atlas-mcp/atlas-token` and `/etc/atlas-mcp/atlas-mcp.env` (`ATLAS_BASE_URL=https://<atlas
   host>`, `MCP_PUBLIC_URL=https://mcp.example.com`), both `0640 root:atlas-mcp`.
4. `cp /opt/atlas-mcp/deploy/atlas-mcp.service /etc/systemd/system/ && systemctl enable --now atlas-mcp`.
   The unit listens on `127.0.0.1:3100`, trusts only the loopback proxy, keeps its store in
   `/var/lib/atlas-mcp` (`StateDirectory`, `0700`), and does not restart after exit codes 2 or 3.
5. Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, add `Environment=MCP_DOMAIN=mcp.example.com` and
   `Environment=MCP_UPSTREAM=127.0.0.1:3100` with `systemctl edit caddy`, and `systemctl restart caddy`.
6. Proxmox firewall for the LXC: inbound TCP 80/443 only; outbound DNS, TCP 443 (Caddy's ACME), and
   Atlas's address and port. Inside the LXC, an nftables rule can tie the adapter to Atlas alone:
   `meta skuid "atlas-mcp" ip daddr != <atlas address> drop` in the output chain (write Atlas's address
   as an IP in `ATLAS_BASE_URL`, or also allow DNS). Do not mount Atlas's data, the Proxmox
   host, or any `/data` into this container.

Manual check: `curl -s https://mcp.example.com/.well-known/oauth-protected-resource/mcp` shows the
resource; `curl -si https://mcp.example.com/mcp -X POST` answers `401` with the challenge;
`curl -si https://mcp.example.com/api/health` answers `404`; Atlas's own address is not reachable from
outside; `journalctl -u atlas-mcp` holds no token.

A tunnel (Cloudflare Tunnel, Tailscale Funnel) can replace the public ports if it terminates HTTPS
for `mcp.example.com` and forwards only the published paths to Caddy or the adapter. A tailnet-only
address is **not** an external ingress: cloud clients such as Claude cannot reach it.

### 3. Connect and approve a client

1. In the client (for example a Claude custom connector), add the server URL
   `https://mcp.example.com/mcp`. It discovers the authorization server, registers, and opens the
   consent page in your browser.
2. On the adapter's host print a code: `docker compose -f mcp/deploy/compose.remote.yaml exec
   atlas-mcp node src/cli.js enroll`, or in the LXC
   `sudo -u atlas-mcp MCP_STATE_DIR=/var/lib/atlas-mcp node /opt/atlas-mcp/src/cli.js enroll`.
3. Check the client name and the host it returns to (for Claude, `claude.ai`), type the code, and press
   **Allow read access**. The client receives its tokens and lists the six tools.

`node src/cli.js clients` lists each client with its status (`waiting`, `approved`, `revoked`),
redirect URIs, active grants, and last use; `node src/cli.js prune` removes every client still
waiting for approval (approved ones are untouched). Expired grants: the client asks again and shows the
consent page; nothing else needs to be done.

### 4. Revoke and rotate

- **One client:** `node src/cli.js revoke <client_id>` — its tokens stop at the next request; other
  clients keep working. The client must register and be approved again.
- **All OAuth access:** stop the adapter and delete `mcp-auth.sqlite*` in `MCP_STATE_DIR` (or the
  `atlas-mcp-state` volume); every client must enroll again.
- **The Atlas token:** create a new Read-only token, replace the secret file, restart the adapter,
  then revoke the old token in Atlas. Revoking it in Atlas first stops every tool call at once
  (`auth_rejected`) — the fastest emergency stop that leaves OAuth untouched.
- **Redeploy safely:** the OAuth store survives restarts and image updates (named volume or
  `StateDirectory`); access tokens issued before a restart keep working.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Anonymous Internet access to inventory or tool metadata | Every `/mcp` request needs an access token; only metadata and OAuth endpoints are public and carry no inventory. Caddy publishes nothing else; Atlas has no public route. |
| Stolen access token | One-hour lifetime, bound to this resource and scope, read-only; revoke the client. |
| Stolen refresh token | Rotation; reuse of a spent token revokes the grant for both parties. |
| Intercepted authorization code / replay | PKCE S256 required; single use, 60 seconds, bound to client and redirect URI; a replay revokes the grant; at most three token requests per code. |
| CSRF / clickjacking on consent | Per-request `__Host-` `SameSite=Strict` cookie, exact `Origin` check, `frame-ancestors 'none'`, `X-Frame-Options: DENY`. |
| Malicious client registration / consent phishing | Registration grants nothing; approval needs a code from the host; the page shows the client name, id, and return host; registrations are rate limited, waiting clients expire in 30 minutes, and a full table evicts the oldest waiting client rather than refusing new ones. |
| Exhausting onboarding capacity | Waiting clients and pending consent requests are bounded and expire; registration evicts instead of refusing; consent places are reserved before any await, one client holds at most three, and the inventory name is one cached Atlas read; `cli.js prune` clears waiting clients. |
| Malicious redirect | Exact match against registered URIs (loopback port relaxation only, RFC 8252); HTTPS or loopback HTTP only; an unregistered URI is never redirected to. |
| SSRF through discovery or client metadata | The adapter fetches no client-supplied URL (no CIMD, no logo/JWKS fetch); its only outbound request is the fixed `ATLAS_BASE_URL`. |
| Token passthrough / confused deputy | OAuth tokens never reach Atlas; the Atlas token never leaves the adapter; audience (resource) checked on every token. |
| DNS rebinding, forged forwarded headers | `Host` allowlist; issuer and resource from configuration only; `X-Forwarded-For` honoured only from `MCP_TRUST_PROXY`. |
| Prompt injection in inventory text | Results are bounded, sanitized, labelled as data; all tools are read-only, so no injected instruction can cause a write. |
| Shared service token | One restricted `inventory:read` token, verified at startup; Atlas's route policy refuses everything else (`403`). |
| Adapter compromise | Read-only Atlas token, no Atlas files, no Docker socket or host mounts, read-only root, no capabilities, egress limited by firewall; the attacker can read what the token reads and no more. |
| Brute force and floods | Per-address rate limits on every public endpoint, enrollment codes of 100 bits and five tries per request, bounded sessions, queue, and bodies. |
| Secrets in logs, backups, diagnostics | Logs scrub `ial_…`, `amcp_…`, and Bearer values and never contain codes; the store keeps hashes; it lives outside Atlas's data, so no Atlas backup or export includes it. |

Remaining trade-offs: confidential clients' secrets are compared as stored by the SDK, so they are
kept in the store (protected by file permissions); every approved client sees the same inventory with
the same scope; the enrollment code proves a shell on the host, not a specific Atlas account.

## Incident response and rollback

1. **Suspected token or client compromise:** `node src/cli.js revoke <client_id>`; check
   `clients` for unknown entries and revoke them too.
2. **Suspected adapter or host compromise:** revoke the adapter's token in Atlas (immediate), stop the
   adapter, rotate the Atlas token, delete the OAuth store, review the adapter's logs (tool names,
   client ids, outcomes — never arguments) and Atlas's security audit trail for that token.
3. **Rollback to private only:** remove `MCP_PUBLIC_URL` (and the Caddy service); the adapter returns
   to Phase 2.1 behaviour on loopback or a private network. The store can stay; it is unused.

## Tests

- `mcp/test/oauth.test.js` — in process with a stand-in Atlas and a controllable clock: discovery
  (`401` and the challenge on `initialize`, `GET`, `DELETE`, `tools/list`; both metadata documents;
  forwarded headers ignored; foreign `Host` refused), registration rules (bad redirect schemes,
  fragments, credentials, counts, grants, response types, scopes; dropped client URLs; escaped names),
  the authorization request (unknown client, malicious redirect never followed, `invalid_scope`,
  `invalid_target`, PKCE required and S256 only), consent (foreign or missing Origin, another
  browser, forged cookie, wrong, reused, expired, and replaced codes, Deny, five wrong tries), the
  token endpoint (wrong verifier, redirect URI, resource, and client; burned codes; code replay
  revoking the grant; expiry), tokens (Atlas tokens, forged and refresh tokens as bearers, session
  ownership), refresh rotation and reuse, expiry and reconnect, revocation by the client and by the
  owner, hashed storage, the registration rate limit, a registration flood of 240 clients from 24
  synthetic addresses after which the owner still onboards a new client at once (approved clients
  kept, waiting ones expiring and pruned), and 120 simultaneous `/authorize` requests from 12
  addresses against a slow Atlas (reservations never above 50, at most three per client, one Atlas
  read, predictable `503`, recovery after expiry, no leaked reservation, the per-address limit).
- `mcp/test/remote.test.js` — a real Atlas, the adapter process in OAuth mode, and an HTTPS reverse
  proxy that publishes only the Caddyfile's paths: the **official MCP SDK client** discovers,
  registers, is approved with a code from `cli.js enroll`, and reads; `cli.js clients` and `revoke`;
  Atlas paths `404` at the edge and on the adapter; forwarded host ignored; cross-origin consent
  refused; an `items:write` Atlas token stops startup; a revoked one drops readiness; no token or
  inventory text in the log. The test certificate in `mcp/test/fixtures/tls/` exists only for it.
- `mcp/test/config.test.js`, `httpServer.test.js`, `atlasClient.test.js` — the remote settings and
  proxy trust, simultaneous handshakes against the session cap, readiness refusing an overprivileged
  token, and queued Atlas requests timing out on their own deadline.
- `mcp/test/docker-remote-smoke.mjs <atlas-image>` — the shipped `compose.remote.yaml` (Caddy with its
  internal CA for `mcp.example.test`, no host ports) beside a real Atlas container: OAuth over HTTPS
  from a client container, Atlas and the adapter unreachable from the public side, no host port,
  mounts, socket, or token in the adapter's environment or log, and the grant surviving a restart.
  The release workflow runs it after the Phase 2.1 smoke test.
- `test/auth.test.js` and `test/auth-policy.test.js` — `GET /api/auth/token` for read and write
  tokens, refused for a session, and the `token` access level.

## Limitations

- Client ID Metadata Documents are not supported; clients use Dynamic Client Registration.
- One owner and one inventory view: there is no per-person identity, and approval is proven by the
  host-side code rather than an Atlas account.
- The OAuth store and MCP sessions belong to one process; there is no shared store for several
  replicas. Sessions end when the adapter restarts (tokens survive).
- Real Claude and ChatGPT connectors, onboarding, and their client limitations are verified in Phase
  2.3 (#67); here the protocol is exercised with the official SDK client.
