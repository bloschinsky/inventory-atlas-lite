# Authentication, roles, and API access

## Summary

Every `/api` request passes one authentication and authorization boundary before any route table
runs. A principal is either a **browser session** of a person or an **API token** of a machine client,
never both. People have one of two server-side roles, **Administrator** (`admin`) and **Viewer /
Read-only** (`viewer`); tokens carry scopes. One explicit table, `server/src/auth/routePolicy.js`,
names the permission of every registered route, and anything it does not name needs
`security:manage`, which no viewer and no token has. Accounts, sessions, tokens, one-time codes, and the
security audit trail live in their own SQLite file, `auth.sqlite`, independent of the inventory.

The public demo has no server and no accounts: it acts as one administrator inside the browser, and
its Security & Access sections say *Not available in the public demo*. The demo build contains no
server-side bypass; the server has no switch that turns authentication off.

## Threat model

**Assets.** The inventory and its photos; the inventory backup file (the whole database); AI provider
keys and cloud backup app credentials and refresh tokens; the machine itself through restore, reset,
and the privileged updater; account passwords, sessions, and API tokens.

**Attackers considered.**

- An anonymous device on the same network, or a visitor who learns the address.
- A malicious web page in the browser of a signed-in person (CSRF, cross-site requests, login CSRF).
- A viewer who crafts requests by hand to reach what the interface hides.
- A leaked or stolen API token, or a token whose owner has since been disabled.
- A client that sends forged `X-Forwarded-*` headers to look like HTTPS or another address.
- Someone who obtains an old inventory backup and restores it, or copies it elsewhere.
- Password guessing against the sign-in form.

**Trust boundaries.** The HTTP interface (untrusted until authenticated); the local machine and
`DATA_DIR` (trusted: whoever can run commands there or read `DATA_DIR` already owns the installation,
so bootstrap and recovery happen there); a reverse proxy, trusted only when `ATLAS_TRUST_PROXY` names it;
external services (AI providers, cloud storage, GitHub, product pages), reached only by administrators'
requests or the backup scheduler.

**Out of scope.** Multi-factor authentication, SSO/LDAP, public registration, teams and per-category
permissions, an MCP server or OAuth authorization server, LAN pairing of the planned Windows desktop
build ([#85](https://github.com/bloschinsky/inventory-atlas-lite/issues/85)), protection against someone with shell or file
access to the server, and denial of service by request volume.

## Roles, permissions, and scopes

`shared/permissions.js` defines the vocabulary, shared with the browser only so it can hide what a
principal may not do:

| Permission | Covers |
| --- | --- |
| `inventory:read` | Items, photos, categories, fields, hierarchy, Dashboard, history, templates, checklists and runs, label data |
| `items:write` | Creating, editing, moving, retiring, lending, and deleting items and their photos, Bulk Move, Bulk Replace, Batch Add |
| `inventory:manage` | Categories, custom fields, templates, checklists, checklist runs, container audits |
| `tools:use` | AI calls, Smart URL import and its images, background removal |
| `settings:manage` | AI provider settings, cloud backup, the database name and Preferred Content Language |
| `maintenance:manage` | Backup download, restore, reset, update check and update |
| `security:manage` | Accounts and API tokens (and every route without a policy entry) |

- **Administrator**: every permission.
- **Viewer**: `inventory:read` only. Checklists and their past runs, label printing, and the Dashboard
  are browsing; starting or changing a run, container audits, templates, and the Data page are not.
  AI, Smart URL import, and background removal are never viewer-safe, even as previews, because they
  cost money or reach other servers. Settings shows a viewer **Interface** and **Sessions** only.
- **Read-only views in this release.** The API lets a viewer read categories and their fields,
  templates, and checklist run details, because they are inventory data. The interface deliberately
  keeps the **Categories & Fields** and **Templates** pages and the checklist run page for
  `inventory:manage`, because each is an editor whose read and write controls are not separated yet.
  A viewer still sees categories and fields in the Items filters and on item pages, the templates do
  not matter without the right to add items, and run history (titles, states, counts, times) stays
  visible on Checklists and item pages, only without the link to the run page. Read-only versions of
  those editors are possible later without any server change.
- **API token scopes** (`shared/accounts.js` validates them): `inventory:read` (the default and always
  included) and `items:write` (adds `items:write`, nothing else). No scope reaches `inventory:manage`,
  `tools:use`, `settings:manage`, `maintenance:manage`, or `security:manage`, so there is no
  unrestricted token. A token acts for the administrator who created it and gets the intersection of
  its scopes with that account's current role: disabling or demoting the creator takes the token's
  access away.

The HTTP verb never decides a permission: `POST /api/items/labels` is a read, a bulk preview is a
write, and `GET /api/backup` is maintenance.

## The request boundary

`server/src/http/authGate.js` runs for every path starting with `/api/` (compared without case, like
Express), after the security headers and the JSON parser and before the maintenance guard and every
route table:

1. **Match.** `matchRoute()` finds the entry for the method and path (no case, no trailing slash,
   literal segments before parameters, `HEAD` as `GET`). No match means `security:manage`.
2. **Credentials.** `Authorization: Bearer …` or the session cookie. Both at once are refused with
   `400 AUTH_AMBIGUOUS_CREDENTIALS` instead of guessing which one counts.
3. **Origin.** A state-changing request without a bearer token must be same-origin: a
   `Sec-Fetch-Site` other than `same-origin`/`none`, or an `Origin` whose host differs from the request
   host, is `403 AUTH_CROSS_SITE_REQUEST`. This covers sign-in, setup, and recovery too (login CSRF).
4. **Transport.** Credentials, and the public sign-in posts, need HTTPS (`req.secure`), a loopback
   client, or `ATLAS_ALLOW_HTTP=true`; otherwise `403 AUTH_HTTPS_REQUIRED`.
5. **Principal.** The session or token is resolved; an invalid cookie is cleared.
6. **CSRF.** A session request that changes anything must send `X-CSRF-Token` equal to the session's
   token, else `403 AUTH_CSRF_INVALID`. The token is an HMAC of the session secret, given to the page
   by `GET /api/auth/session` and the sign-in answers, and kept only in memory by `client/src/auth.js`.
7. **Decision.** Public routes pass. No principal is `401 AUTH_REQUIRED` (`AUTH_SETUP_REQUIRED` while
   no account exists). `session` routes refuse tokens, and `token` routes refuse sessions. A missing
   permission is `403 AUTH_FORBIDDEN`.
   A `fresh` route needs a password confirmation within `AUTH_REAUTH_WINDOW_MS` (ten minutes), else
   `403 AUTH_REAUTH_REQUIRED`, which the browser answers with the **Confirm your password** dialog and
   then repeats the request.
8. **Redirect routes.** The cloud OAuth callback is a top-level navigation, so its refusals redirect
   to `/settings/cloud-backup?cloud=error` instead of answering JSON.

Errors use the existing `{ error: { code, params } }` envelope and are translated in both locales.
Refusals with an `AUTH_` code are not logged with stack traces, and nothing ever logs a password,
token, cookie, or code. Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options:
DENY`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, a CSP with
`frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`, and over HTTPS
`Strict-Transport-Security`; API answers are `Cache-Control: no-store`. JSON bodies stay limited to
1 MB and uploads keep their existing limits.

## Authorization matrix

Generated from `ROUTE_POLICY`; `test/auth-policy.test.js` fails when a route of `server/src/routes/`
has no entry or an entry names no route. "own" means the person's own account or sessions only.

| Method | Path | Requires | Admin | Viewer | API token | Side effects, sensitivity, and exceptions |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | public | yes | yes | yes | Status and version only; Docker and the deployment scripts poll it. |
| GET | `/api/auth/session` | public | yes | yes | yes | Says whether setup is pending; returns the anti-CSRF token of an existing session only. |
| POST | `/api/auth/login` | public | yes | yes | yes | Throttled; same answer for every refusal; always starts a new session. |
| POST | `/api/auth/setup` | public | yes | yes | yes | Needs the one-time code from `auth init`; refused once any account exists. |
| POST | `/api/auth/recover` | public | yes | yes | yes | Needs the one-time code from `auth recover <name>` for that account. |
| POST | `/api/auth/logout` | session | own | own | — | The signed-in person's own account; never a token. |
| POST | `/api/auth/reauthenticate` | session | own | own | — | The signed-in person's own account; never a token. |
| POST | `/api/auth/password` | session | own | own | — | The signed-in person's own account; never a token. |
| GET | `/api/auth/sessions` | session | own | own | — | The signed-in person's own account; never a token. |
| POST | `/api/auth/sessions/revoke-others` | session | own | own | — | The signed-in person's own account; never a token. |
| DELETE | `/api/auth/sessions/:id` | session | own | own | — | The signed-in person's own account; never a token. |
| GET | `/api/auth/token` | token | — | — | own | The calling token's id, scopes, effective permissions, and expiry; never its secret, never a session. The MCP adapter refuses to run with more than `inventory:read`. |
| GET | `/api/security/users` | `security:manage` | yes | — | — | Accounts and credentials. |
| POST | `/api/security/users` | `security:manage` | yes | — | — | Accounts and credentials. Fresh password confirmation. |
| PATCH | `/api/security/users/:id` | `security:manage` | yes | — | — | Accounts and credentials. Fresh password confirmation. |
| POST | `/api/security/users/:id/password` | `security:manage` | yes | — | — | Accounts and credentials. Fresh password confirmation. |
| GET | `/api/security/tokens` | `security:manage` | yes | — | — | Accounts and credentials. |
| POST | `/api/security/tokens` | `security:manage` | yes | — | — | Accounts and credentials. Fresh password confirmation. |
| DELETE | `/api/security/tokens/:id` | `security:manage` | yes | — | — | Revoking only reduces access, so it needs no fresh confirmation. |
| GET | `/api/capabilities` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Feature flags and the instance label; no credentials. |
| GET | `/api/database/metadata` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Name, UUID, and dates of the inventory; shown by the indicator. |
| PUT | `/api/database/metadata` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| PUT | `/api/database/metadata/content-language` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| GET | `/api/items` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/columns` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/hierarchy` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/parent-candidates` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/transferred-to-suggestions` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/location-suggestions` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/bulk-replace/fields` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Field and value lists; inventory data a viewer can already read. |
| GET | `/api/items/bulk-replace/values/:type/:id` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Field and value lists; inventory data a viewer can already read. |
| GET | `/api/items/:id` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/:id/history` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/photos/:id` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Original photo bytes of the inventory. |
| POST | `/api/items/labels` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | POST only carries the selection; reads label data. |
| POST | `/api/items` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| POST | `/api/items/batch` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| PUT | `/api/items/:id` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| DELETE | `/api/items/:id` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| PATCH | `/api/items/:id/lifecycle` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| POST | `/api/items/:id/transfers` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| POST | `/api/items/:id/transfers/:transferId/return` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| POST | `/api/items/bulk-replace/preview` | `items:write` | yes | — | `items:write` | A preview that exists only to prepare a write. |
| POST | `/api/items/bulk-replace` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| POST | `/api/items/bulk-parent/preview` | `items:write` | yes | — | `items:write` | A preview that exists only to prepare a write. |
| PATCH | `/api/items/bulk-parent` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| POST | `/api/items/:id/photos` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| PUT | `/api/items/:id/photos/order` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| DELETE | `/api/photos/:id` | `items:write` | yes | — | `items:write` | Changes items or their photos. |
| GET | `/api/categories` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| POST | `/api/categories` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| PUT | `/api/categories/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| DELETE | `/api/categories/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| GET | `/api/categories/:id/fields` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| POST | `/api/categories/:id/fields` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| POST | `/api/categories/:id/fields/batch` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| GET | `/api/fields/:id/suggestions` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| PATCH | `/api/fields/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| DELETE | `/api/fields/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| GET | `/api/item-templates` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/item-templates/:id` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/item-templates/:id/item-draft` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| POST | `/api/item-templates` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| PUT | `/api/item-templates/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| DELETE | `/api/item-templates/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| GET | `/api/checklists` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/checklists/:id` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/checklists/:id/runs` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/checklist-runs` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/checklist-runs/:runId` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| GET | `/api/items/:id/audits` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| POST | `/api/checklists` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| PUT | `/api/checklists/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| DELETE | `/api/checklists/:id` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| POST | `/api/checklists/:id/runs` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| PATCH | `/api/checklist-runs/:runId/items/:runItemId` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| PATCH | `/api/checklist-runs/:runId/inventory-items/:itemId` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| POST | `/api/checklist-runs/:runId/complete` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| POST | `/api/items/:id/audits` | `inventory:manage` | yes | — | — | Changes the inventory structure or runs checklists. |
| GET | `/api/dashboard` | `inventory:read` | yes | yes | `inventory:read`, `items:write` | Read only. |
| POST | `/api/ai/items/analyze` | `tools:use` | yes | — | — | Costly or external server work (AI, page fetch, image processing). |
| POST | `/api/ai/translate` | `tools:use` | yes | — | — | Costly or external server work (AI, page fetch, image processing). |
| POST | `/api/categories/:id/fields/ai` | `tools:use` | yes | — | — | Costly or external server work (AI, page fetch, image processing). |
| POST | `/api/images/remove-background` | `tools:use` | yes | — | — | Costly or external server work (AI, page fetch, image processing). |
| POST | `/api/items/import-url/preview` | `tools:use` | yes | — | — | Costly or external server work (AI, page fetch, image processing). |
| POST | `/api/items/import-url/:token/variant` | `tools:use` | yes | — | — | Costly or external server work (AI, page fetch, image processing). |
| POST | `/api/items/import-url/:token/ai` | `tools:use` | yes | — | — | Costly or external server work (AI, page fetch, image processing). |
| GET | `/api/items/import-url/:token/images/:index` | `tools:use` | yes | — | — | Serves an image fetched by the server for an import preview. |
| GET | `/api/settings/ai` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| PUT | `/api/settings/ai` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| GET | `/api/ai/models` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| POST | `/api/ai/models` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| POST | `/api/ai/test` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| GET | `/api/cloud-backup` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| PUT | `/api/cloud-backup/settings` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| PUT | `/api/cloud-backup/providers/:provider/app` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| DELETE | `/api/cloud-backup/providers/:provider/app` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| POST | `/api/cloud-backup/providers/:provider/connect` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| GET | `/api/cloud-backup/oauth/callback` | `settings:manage` | yes | — | — | Browser navigation: refusals redirect to Settings; the OAuth state must belong to this session. |
| POST | `/api/cloud-backup/providers/:provider/test` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| POST | `/api/cloud-backup/providers/:provider/backup` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| DELETE | `/api/cloud-backup/providers/:provider` | `settings:manage` | yes | — | — | Configuration and its secrets. |
| GET | `/api/backup` | `maintenance:manage` | yes | — | — | Exports the whole inventory database. |
| GET | `/api/restore/status` | `maintenance:manage` | yes | — | — | The whole database or the machine. |
| POST | `/api/restore/validate` | `maintenance:manage` | yes | — | — | The whole database or the machine. Fresh password confirmation. |
| POST | `/api/restore/apply` | `maintenance:manage` | yes | — | — | The whole database or the machine. Fresh password confirmation. |
| POST | `/api/database/reset/prepare` | `maintenance:manage` | yes | — | — | The whole database or the machine. Fresh password confirmation. |
| POST | `/api/database/reset/apply` | `maintenance:manage` | yes | — | — | The whole database or the machine. Fresh password confirmation. |
| GET | `/api/update/check` | `maintenance:manage` | yes | — | — | Calls GitHub (cached). |
| GET | `/api/update/status` | `maintenance:manage` | yes | — | — | The whole database or the machine. |
| POST | `/api/update/apply` | `maintenance:manage` | yes | — | — | Starts the privileged updater; also same-origin only. Fresh password confirmation. |

Static files and the page shell (`index.html`, the built `dist/` assets, and the client-side routes
served by the production fallback) are public: they contain no inventory data and no secret. Any
`/api` path that no route answers still passes the gate first, so an anonymous request gets `401`
rather than a hint about which routes exist.

## Browser sessions

- `POST /api/auth/login` verifies the password with Argon2id. An unknown name, a wrong password, and a
  disabled account get the same `401 AUTH_INVALID_CREDENTIALS` after the same amount of work (an
  unknown name is verified against a dummy hash). Hashes with older parameters are upgraded on the
  next successful sign-in.
- Each sign-in creates a new session: 16 random bytes of identifier and 32 of secret, the cookie value
  `<id>.<secret>`, and only `sha256(secret)` stored. A session cookie sent along with the sign-in is
  deleted, so a planted identifier is never adopted (session fixation).
- The cookie is `HttpOnly`, `SameSite=Lax` (it must survive the top-level return from a cloud provider's
  OAuth page), `Path=/`, persistent for the absolute lifetime, and over HTTPS `Secure` with the
  `__Host-ial_session` name; plain HTTP uses `ial_session`. Neither the secret nor the CSRF token is
  ever placed in `localStorage`, `sessionStorage`, or a URL.
- A session ends after `AUTH_SESSION_IDLE_MS` without a request (three days) and in any case after
  `AUTH_SESSION_ABSOLUTE_MS` (30 days). Activity is written at most every five minutes, so reads do not
  turn into writes. Expired sessions are deleted at startup and when they are presented.
- `POST /api/auth/logout` deletes the session. **Sessions** lists the account's sessions (a coarse
  browser and system name derived from the User-Agent, the client address, and times — never a device
  identity) and revokes one or all others.
- A changed password (own, with the current one) ends every session of the account and continues in a
  new one; a reset by an administrator, a role change, and disabling end every session of that account.
  A disabled account's sessions stop working at once, because every request checks the account.
- **Fresh confirmation.** Restore validate and apply, reset prepare and apply, update apply, creating
  or changing an account, resetting a password, and creating an API token need the password within the
  last `AUTH_REAUTH_WINDOW_MS`; signing in counts. `POST /api/auth/reauthenticate` confirms it. The
  existing typed confirmations and single-use tokens of restore and reset stay as they were.
- **Throttling** (`server/src/auth/loginThrottle.js`): five failures per client address and name, and
  twenty per address, within fifteen minutes, then `429 AUTH_TOO_MANY_ATTEMPTS` with
  `retryAfterSeconds`. It applies to sign-in, password confirmation, setup, and recovery codes. There is
  no account-wide lockout, so nobody elsewhere can lock the administrator out; counters live in memory.

## Bootstrap and recovery

- While `auth.sqlite` has no account, only `GET /api/health`, `GET /api/auth/session`, and the
  sign-in posts answer; everything else is `401 AUTH_SETUP_REQUIRED`, and the browser shows **Create
  the first administrator**. There is no anonymous claim route and no default password.
- `server/src/cli/auth.js` (`npm run auth -- <command>`) opens the store directly: `init` prints a
  one-time setup code (100 bits, unambiguous characters, valid 30 minutes, only its hash stored, a new
  one replaces the last), `recover <username>` prints a recovery code for one account (`--revoke-tokens` also revokes every API token the account
  created, for a suspected leak; without it the tokens keep working and the command says so), and `users` lists
  the accounts. `POST /api/auth/setup` with the code creates the administrator; the count check, the
  code check, and the insert are one transaction, so of two simultaneous claims exactly one succeeds.
  `POST /api/auth/recover` with a recovery code sets a new password, enables the account, and ends its
  sessions; it never changes a role. The command line has no HTTP endpoint.
- Docker: `docker exec <container> node server/src/cli/auth.js <command>` (the image runs as `node`,
  which owns `/data`). Proxmox LXC: `/usr/local/sbin/inventory-atlas-auth <command>`
  (`deploy/inventory-atlas-auth`), installed by the installer and the updater, which runs the command
  as `inventory-atlas` with the installation's `DATA_DIR`. The first update from an older release runs
  the previous updater, so that update is followed by `sh /opt/inventory-atlas-lite/app/deploy/inventory-atlas-auth init`.
- An existing installation keeps its inventory, photos, settings, and backups when it updates; it is
  locked until the administrator is created. There is no anonymous or legacy mode to fall back to.
- **Privileged local paths without credentials.** The Proxmox updater takes its pre-update backup with
  `server/src/cli/backup.js`, run as the service account: SQLite's online backup API (the primitive
  of the download) on a read-only connection to `inventory.sqlite`, checked with `quick_check` and
  renamed into place only when it is valid. `GET /api/backup` stays administrator-only, and the
  updater is never given a session or a token. The command reads nothing it could not already read
  as the owner of `DATA_DIR` and never opens `auth.sqlite`.
- **Release smoke test.** `test/docker-smoke.mjs` runs on the built image in
  `.github/workflows/release.yml`: `docker exec … auth.js init` prints the setup code, the script
  creates the administrator through `POST /api/auth/setup` and stores data with the session cookie
  and CSRF header, and after the container is recreated on the same volume it checks that no setup is
  pending, signs in with the same account, refuses anonymous requests, and reads everything back. The
  disposable container sets `ATLAS_ALLOW_HTTP=true`, because the runner reaches it over the Docker
  bridge, which is not loopback inside the container.

## The security store

`server/src/auth/authDatabase.js` opens `DATA_DIR/auth.sqlite` (WAL, foreign keys) and migrates it
with its own `user_version` (currently 1), independent of the inventory schema:

| Table | Contents |
| --- | --- |
| `users` | Name (unique without case), role (`CHECK` admin or viewer), Argon2id hash, disabled time, timestamps |
| `sessions` | Identifier, account, `sha256` of the secret, created, last seen, absolute expiry, last password confirmation, coarse client, address |
| `api_tokens` | Identifier, name, owner, scopes, `sha256` of the secret, created, expiry, last used (written at most every five minutes), revoked |
| `one_time_codes` | Purpose (setup or recovery), account, `sha256` of the code, expiry |
| `audit_events` | Time, event, principal type, acting account, target, address; the last 5,000 are kept |

- The file and its sidecars are `chmod 0600` where the platform supports it; the Docker image and the
  Proxmox service run as the owner of `DATA_DIR`.
- A file that fails `quick_check` or has a newer schema stops the server with a pointer to README
  ("Security store recovery") instead of starting with an empty store.
- Inventory backup, cloud backup, restore, and reset only ever touch `inventory.sqlite`: a backup
  never contains an account, hash, session, or token; restoring an old backup or resetting the
  inventory leaves accounts, sessions, revocations, and tokens exactly as they are.
- Each instance has its own `DATA_DIR` and therefore its own store; the instance label and the
  database name play no part in authorization.
- Moving or backing up the store is a separate operator step (stop the server, copy `auth.sqlite*`
  with the rest of `DATA_DIR`), described in README.

## Password hashing

`server/src/integrations/argon2PasswordHasher.js` uses the maintained `argon2` package (MIT, prebuilt
binaries for Linux x64/arm64 with glibc and musl, macOS, and Windows, loaded by `node-gyp-build`, so the
Docker image, the Proxmox build, and development need no compiler for it) with Argon2id,
`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1 — the OWASP minimum, a few tens of milliseconds per
hash, and small enough for a 1 GiB container. Each hash records its parameters; raising them later
rehashes on the next sign-in. Passwords are 12 to 256 characters; names are 3 to 64 letters, digits,
dots, dashes, or underscores.

## API tokens

- Format `ial_<16 hex id>_<43 base64url secret>`; only `sha256(secret)` is stored. The full value is in
  the creation answer only; lists show `ial_<id>_…`, the scopes, owner, status (active, expired,
  revoked), created, last used, and expiry (30, 90, or 365 days, or none).
- Sent as `Authorization: Bearer`; query strings, cookies, and browser storage are never used. A token
  needs no CSRF header (it is not an ambient credential) and never reaches the `session` routes.
- Revoking is immediate and kept forever; an expired token is refused; a disabled owner's tokens stop.
- The audit trail records token creation and revocation separately from people's sessions
  (`principal_type` `session` or `token`).
- The optional [read-only MCP adapter](mcp-read-only-adapter.md) (Phase 2.1) calls this API's GET
  endpoints with a dedicated `inventory:read` token and adds no route of its own; client consent and
  OAuth at its external boundary are Phase 2.2.

## Reverse proxies and HTTPS

- `ATLAS_TRUST_PROXY` (`server/src/auth/authConfig.js`) takes the Express presets `loopback`,
  `linklocal`, `uniquelocal`, IP addresses, and CIDR ranges, comma-separated; `true`, hop counts, and
  anything else stop the server. Unset, no forwarded header is believed, so `req.secure`, `req.ip`, and
  the host used by the origin check come from the connection itself.
- Behind a trusted proxy, `X-Forwarded-Proto: https` makes the request secure (Secure cookie, HSTS),
  `X-Forwarded-For` gives the client address for throttling, and `X-Forwarded-Host` the host.
- Plain HTTP from another machine is refused for credentials unless `ATLAS_ALLOW_HTTP=true`. Loopback
  is allowed for development and the Vite proxy; the same exception means a reverse proxy on the same
  host must be named in `ATLAS_TRUST_PROXY`, or it would look like a local client.

## Cloud backup OAuth

`POST /api/cloud-backup/providers/:provider/connect` and the callback both need `settings:manage`. The
route remembers which session started each state; the callback completes only when the state cookie,
the state, and the session all match, otherwise it is treated as unverified
(`CLOUD_CONNECT_UNVERIFIED`) and redirects to Settings. It never creates a session.

## Interface

- `client/src/auth.js` holds the session state (`loading`, `setup`, `signedOut`, `signedIn`), the
  permissions, and the CSRF token; `client/src/api.js` adds the header and hands `AUTH_REQUIRED` (back
  to sign-in with the current address) and `AUTH_REAUTH_REQUIRED` (the password dialog, then the same
  request again) to it.
- `client/src/pages/SignIn.vue` is **Sign in** (`/login`), **Create the first administrator**
  (`/setup`), and **Use a recovery code** (`/recover`), outside the application shell, responsive, and
  in both languages. After success the person continues at `?redirect=` (same-site paths only).
- `client/src/components/SignInHelp.vue` is the collapsed, in-context help of those pages: an accessible
  disclosure (`aria-expanded`, keyboard-operable) with a **Proxmox LXC** / **Docker** / **Manual /
  development** radio group and copyable commands (Copy with spoken feedback; where the browser offers
  no clipboard, as on a plain-HTTP page, the command is selected for copying by hand). **Setup help**
  shows the `init` commands and **Recovery help** the `recover <username>` commands for each
  installation (Proxmox host `pct list` and `pct exec <CTID> -- /usr/local/sbin/inventory-atlas-auth …`,
  inside the container `inventory-atlas-auth …`, Docker `docker exec <container> node
  server/src/cli/auth.js …`, manual `npm run auth -- …` with the server's `DATA_DIR`), and explains
  that the code is one-time, made on the server, valid for 30 minutes, and not a password. Only when a
  request fails with `AUTH_HTTPS_REQUIRED` (`ApiError.code`) does **How to fix this?** appear under
  the error: an HTTPS reverse proxy with `ATLAS_TRUST_PROXY` first, then a trusted-network warning and
  where to set `ATLAS_ALLOW_HTTP=true` for the chosen installation (Proxmox: `pct enter <CTID>`,
  `/etc/inventory-atlas-lite.env`, `systemctl restart inventory-atlas-lite`; Docker: check the
  `/data` mount with `docker inspect`, back up with `server/src/cli/backup.js` and `docker cp`, then
  recreate from the original `docker run` with the same `/data` volume or folder plus
  `-e ATLAS_ALLOW_HTTP=true`, or the Compose environment — never a blind `docker rm`, because the
  image's `VOLUME /data` makes a container started without `-v` keep the inventory in an anonymous
  volume a new container would not reuse; manual: the server process environment and a restart).
  The installation is the person's choice, shared by both panels of a page; nothing is detected or
  asked from the server, and opening help or switching never changes the typed form values.
- The router guard in `client/src/main.js` sends every page without a session to sign-in and redirects
  pages whose `meta.permission` the role lacks; navigation links and Settings sections with a
  `permission` are hidden. Viewers get read-only pages: no Add item, Move to…, Edit, Transfer, More
  menu actions other than QR Code, photo Delete, loan return, audit, checklist start/edit/delete, run links, or
  Dashboard **Add item**; the database indicator is plain text; About offers no update panel.
- `client/src/components/AccountMenu.vue` (desktop line and phone drawer) shows the name and role with
  **Sessions & password** and **Sign out**. `ReauthDialog.vue` is the password confirmation, stacked
  above Settings and About.
- **Settings → Security & Access**: `UsersSettings.vue` (accounts, add, role, reset password,
  disable/enable; one's own row has no actions), `ApiAccessSettings.vue` (create, show once with Copy,
  masked list, revoke with confirmation), and `SessionsSettings.vue` (own sessions and password change,
  for every role).

## Tests

- `test/auth-policy.test.js`: every registered route has one entry and every entry a route, the public
  allowlist, Express-like matching and the default rule, viewer and token permissions, and the fresh
  routes.
- `test/auth.test.js`: locked fresh boot, every protected route anonymous `401`, setup codes and the
  claim race, uniform login refusals, JSON and same-origin sign-in, cookie flags, CSRF and cross-site
  refusals, session fixation, throttling, logout; HTTPS enforcement with and without a trusted proxy,
  spoofed forwarded headers, `__Host-`/Secure cookies, the HTTP opt-in, an unsafe trust setting; a
  viewer's reads and refused writes, previews, tools, exports, settings, maintenance, administration,
  self-escalation, and OAuth callback; tokens (scopes, one-time display, hashing, write limits, dual
  credentials, revocation, expiry, a disabled owner, nothing readable in the store); fresh
  reauthentication, self-lockout, the last administrator, password reset and change with session
  rotation, session revocation; command-line recovery, backup isolation and restore, restarts, separate
  instances, and a damaged store.
- `test/backup-cli.test.js`: the local backup command copies the live inventory of a running,
  authenticated server (valid, without the security store), fails cleanly without an inventory, and
  is what `scripts/update.sh` uses before the code swap instead of the HTTP download.
- `test/serverProcess.js` provisions the test administrator in each test server's store and returns a
  signed-in `fetch`; `test/e2e/globalSetup.js` and `test/e2e/fixtures.js` do the same for Playwright.
- `test/e2e/auth.spec.js`: deep-link sign-in and return, refused password, sign-out, the Ukrainian phone
  sign-in and recovery pages, setup and recovery help (collapsed by default, keyboard disclosure,
  installation switching, setup versus recovery commands, Copy, kept form values), the
  `AUTH_HTTPS_REQUIRED` guidance offered only for that error, the read-only viewer interface and its blocked addresses and Settings
  sections, Security & Access (add and disable a viewer, a token shown once and revoked, sessions), and
  the password confirmation of an aged session.

## Tradeoffs and limits

- Two roles only, no MFA or SSO; throttling is in memory and per process.
- Sessions are stored server-side, so revocation is immediate, at the cost of one indexed lookup per
  request in a small local database.
- `SameSite=Lax` instead of `Strict` keeps the OAuth return working; the CSRF token and the origin
  check cover what Lax allows.
- Bearer tokens are hashed with SHA-256, not Argon2: they carry 256 bits of randomness, and a slow hash
  would only slow every API call.
- Rolling back to a release before 0.71.0 removes sign-in; the store is left in place for the next
  update.
