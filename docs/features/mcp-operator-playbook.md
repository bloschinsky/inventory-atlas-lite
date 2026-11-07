# MCP operator playbook

How to give an AI assistant read-only access to your Inventory Atlas through the MCP adapter, keep it
working, and take it away again. [Українською](mcp-operator-playbook.uk.md).

The deployment details (Compose files, Caddy, the Proxmox LXC, configuration variables, the threat
model) are in [Remote MCP access with OAuth](mcp-remote-oauth.md); what was tested and which clients
support what is in [MCP client integration](mcp-client-integration.md). Host names here are examples
only: `mcp.example.com` (public), `atlas.internal.example` (private).

> **Privacy first.** When an assistant such as Claude or ChatGPT reads your inventory, the records it
> reads (names, descriptions, locations, custom fields, history — never photos) are sent to that
> provider and handled under its terms. Connect only an assistant whose provider you accept for this
> data. The adapter cannot change anything in Atlas, but it cannot pull back what was already read.

## What lives where

| Place | What it holds | Who sees it |
| --- | --- | --- |
| **Atlas** (private, `atlas.internal.example`) | The inventory; your Administrator account (and an optional Viewer); one **Read-only** API token named *MCP adapter* | You. Never published to the Internet |
| **MCP adapter** (`mcp.example.com` behind Caddy) | That token in a secret file (`mcp/secrets/atlas-mcp-token` or `/etc/atlas-mcp/atlas-token`); the OAuth store in `MCP_STATE_DIR` (approved clients, token hashes); its logs | The adapter's host only. Treat the store like a password database |
| **AI client** (Claude, ChatGPT) | The server URL `https://mcp.example.com/mcp` and the OAuth tokens it received after your approval | The provider. It never receives the Atlas token or your Atlas password |

One Administrator is enough. The adapter does not use any Atlas account to sign in: the token works
for the account that created it, so if that account is disabled, the adapter stops reading. A Viewer
account is only for people who browse Atlas itself; it plays no part in MCP.

## Installation checklist

1. **Atlas is current** (0.73.0 or later) and not reachable from the Internet.
2. **Create the token** in Atlas: **Settings → Security & Access → API Access → Create token**, name
   *MCP adapter*, Access **Read-only**, an expiry you will rotate before. Copy it once into the secret
   file, alone on its line; never into an environment value, command line, chat, or ticket.
3. **Deploy the adapter** with [Docker Compose](mcp-remote-oauth.md#2a-docker-compose-mcpdeploycomposeremoteyaml)
   or in a [Proxmox LXC](mcp-remote-oauth.md#2b-proxmox-lxc-dedicated-container-next-to-atlas).
   `MCP_PUBLIC_URL=https://mcp.example.com` must be the exact public name.
4. **DNS and certificate:** `mcp.example.com` points at the Caddy host (or the tunnel), ports 80 and
   443 reach Caddy, and Caddy has obtained a certificate (`docker compose … logs caddy`, or
   `journalctl -u caddy`: "certificate obtained successfully").
5. **Check from outside** (a phone on mobile data is enough):
   - `curl -s https://mcp.example.com/.well-known/oauth-protected-resource/mcp` shows
     `"resource":"https://mcp.example.com/mcp"`;
   - `curl -si -X POST https://mcp.example.com/mcp` answers `401` with `WWW-Authenticate: Bearer …`;
   - `curl -si https://mcp.example.com/api/health` and `https://mcp.example.com/` answer `404`;
   - Atlas's own address does not answer at all.
6. **Logs are clean:** the adapter logged `atlas-mcp listening …` and `ready`, and no line contains
   `ial_` or `amcp_` followed by a secret.

Firewall note: Claude connects from `160.79.104.0/21`
([Anthropic](https://claude.com/docs/connectors/building/authentication#network-reference)). You may
limit `/mcp`, `/token`, `/register`, and the metadata to that range, but **your own browser** must
still reach `/authorize` and `/consent` to approve a client.

## Connect Claude

Claude web or Desktop, any plan that offers custom connectors (on Free, one custom connector; on Team
or Enterprise, an Owner adds it first). Labels as documented on 2026-11-07; they may move.

1. Open **Customize → Connectors** and press **Add custom connector** (Team/Enterprise Owners:
   **Organization settings → Connectors → Add → Custom**, type **Web**).
2. Name it, for example *Home inventory*. **MCP server URL:** `https://mcp.example.com/mcp` — exactly
   this, with `/mcp`.
3. If the dialog asks how Claude identifies itself (**OAuth client**), choose **Register
   automatically**. The adapter does not support *Use Claude's published identity* (Client ID Metadata
   Documents); Claude falls back to registration anyway. Leave the client ID and secret empty, and add
   no request headers. Authentication: **Sign in now**.
4. Press **Add**, then **Connect**. Claude opens the adapter's consent page.
5. On the adapter's host print a code:
   `docker compose -f mcp/deploy/compose.remote.yaml exec atlas-mcp node src/cli.js enroll`
   (LXC: `sudo -u atlas-mcp MCP_STATE_DIR=/var/lib/atlas-mcp node /opt/atlas-mcp/src/cli.js enroll`).
6. On the consent page check that **Returns to** is `claude.ai`, the access is `inventory:read`, and
   the inventory is yours. Type the code and press **Allow read access**. Back in Claude the connector
   shows **Connected**.
7. In a chat, open **+ → Connectors** and turn the connector on. Under the connector's **Tool
   permissions** you can keep **Needs approval** (Claude asks before each call) or choose **Always
   allow** — every tool is read-only.
8. Try: "Which categories do I have?", "Where is <an item>?", "Delete <an item>" (Claude must say it
   cannot).

On the phone, the Claude app uses the connector you added on the web; turn it on in the chat the same
way. Whether voice conversations call connector tools is not documented; do not rely on it.

Claude Code can use the same connector through your Claude account, or add the URL directly
(`claude mcp add --transport http inventory https://mcp.example.com/mcp`); it signs in through a
loopback address on your computer, which the adapter accepts.

## Connect ChatGPT (where your plan allows it)

As of 2026-11-07 OpenAI documents custom MCP servers for **Business** and **Enterprise/Edu**
workspaces on the **web**; on Business only admins and owners add them. **Pro** can connect custom MCP
servers with read and fetch access only; whether that mode uses this adapter's tools has not been
tested. For **Plus** it is not confirmed: if your account shows the option, try it; if it does not,
there is no supported workaround. Free plans have no custom MCP servers, and custom MCP connections
are web-only, so the mobile apps cannot use them.

1. Open **Plugins**, press **+**, then **Add custom MCP server**.
2. Name and description; **Connection:** the URL `https://mcp.example.com/mcp`; **Authentication:**
   OAuth. Read the warning and confirm.
3. ChatGPT registers and opens the consent page: print a code (step 5 above), check that **Returns
   to** is a ChatGPT/OpenAI host, type the code, **Allow read access**.
4. Because every tool says `readOnlyHint: true`, ChatGPT does not ask for write confirmations.

## MCP Inspector (protocol check without a vendor account)

`npx @modelcontextprotocol/inspector`, transport *Streamable HTTP*, URL
`https://mcp.example.com/mcp`, then **Open Auth Settings → Quick OAuth Flow**. It registers with a
loopback redirect on your computer, opens the consent page, and lists the six tools. Use its proxy
connection: the adapter sends no CORS headers for a page in your browser to call it directly.

## Diagnosing failures

| Symptom | Where | Meaning | What to do |
| --- | --- | --- | --- |
| Client says it cannot reach the server; no request in the adapter log | DNS, certificate, firewall, Caddy | The client never got through | Check step 4–5 of the checklist from outside your network |
| `401` on `/mcp`, `WWW-Authenticate: Bearer error="invalid_token"` | Adapter, OAuth | No token, an expired/revoked one, or one for another resource | Normal before sign-in. Afterwards: the client refreshes or shows **Reconnect**; approve again. A revoked client must register again |
| Consent page answers `400` before it is shown | Adapter | Unknown client or a redirect URI it did not register | Remove and add the connector again |
| *Request expired* or *Client unavailable* (`400`) after pressing Allow | Adapter | The page is older than ten minutes, was opened in another browser, or the client was revoked | Start the connection again from the client, in one browser |
| *Request refused* (`403`) after pressing Allow | Adapter | The form was sent from another origin (for example a proxy that rewrites the host) | Open the consent page under `https://mcp.example.com` exactly |
| *Try again later* (`503`) or *Too many attempts* (`429`) | Adapter | Too many pending requests, or the per-address limit | Wait a few minutes, or run `node src/cli.js prune` |
| Wrong code five times | Adapter | The request ended with `access_denied` | Start the connection again; print a fresh code |
| Tool result `auth_rejected` | Atlas → adapter | Atlas refused the adapter's token: revoked, expired, or its owner disabled | Create a new Read-only token, replace the secret file, restart the adapter |
| Tool result `forbidden` | Atlas → adapter | The token may not read this (`403`), or Atlas refuses tokens over plain HTTP (`AUTH_HTTPS_REQUIRED`) | Give Atlas HTTPS, or keep the hop on a private network as described in the deployment guide |
| Adapter exits with code 3, log `token_overprivileged` | Adapter start | The token can do more than read | Use a **Read-only** token |
| Tool result `upstream_unavailable` / readiness `503` | Atlas → adapter | Atlas is down or slow | Start Atlas; the adapter recovers by itself |
| Result says `text_shortened: true` | Adapter | Long texts were cut to keep the answer within the size limit | Open the item in Atlas for the full text |

In short: **401 is about the AI client's OAuth sign-in to the adapter; `auth_rejected` and `forbidden`
inside a tool result are about the adapter's Atlas token.**

## Health checks and logs

- LXC: `curl -s http://127.0.0.1:3100/healthz` — the process runs; `curl -s http://127.0.0.1:3100/readyz`
  — Atlas accepts the token (`{"status":"ready"}`, otherwise a `reason`); `systemctl status atlas-mcp`,
  `journalctl -u atlas-mcp`.
- Docker: `docker compose -f mcp/deploy/compose.remote.yaml ps` shows the adapter `healthy` (the image
  probes `/healthz`); logs with `… logs atlas-mcp`. Neither probe is published through Caddy.
- The log holds tool names, client ids, outcomes, and durations, never arguments, inventory text, or
  tokens. `node src/cli.js clients` lists every client with status and last use.
- Certificates: Caddy renews them by itself. After a renewal nothing has to restart; check with
  `curl -vI https://mcp.example.com/.well-known/oauth-authorization-server` (the expiry date).

## Routine changes

- **Rotate the Atlas token** before it expires: create a new Read-only token, replace the secret file,
  restart the adapter, check `/readyz`, then revoke the old token in Atlas.
- **Update** the adapter like any service (`docker compose … up -d --build`, or copy the new `mcp/`
  and `npm ci --omit=dev`). The OAuth store survives: connectors keep their grant and reconnect.
- **Disconnect one assistant:** `node src/cli.js revoke <client_id>`; the others keep working. In the
  client, **Disconnect** or **Remove** the connector too.
- **Clean up registrations:** every fresh Claude connection registers a new client; old approved ones
  that you revoked stay listed as `revoked`, waiting ones expire after 30 minutes.

## Turn external access off

- **Temporarily:** stop Caddy (or the tunnel). Nothing is reachable; grants stay.
- **For good:** stop the adapter, delete the OAuth store (`mcp-auth.sqlite*` in `MCP_STATE_DIR`, or
  the `atlas-mcp-state` volume), revoke the adapter's token in Atlas, and remove the connector in each
  AI client. Removing `MCP_PUBLIC_URL` returns the adapter to private, loopback-only use.

## Incident response

1. **An assistant or its tokens may be compromised:** `node src/cli.js revoke <client_id>`; look in
   `cli.js clients` for clients you do not recognise and revoke them too.
2. **The adapter's host may be compromised:** revoke the adapter's token in Atlas first (instant stop
   for every tool call), stop the adapter, delete the OAuth store, review the adapter's log and Atlas's
   security audit trail for that token, then redeploy on a clean host with a new token.
3. **Something was read that should not have been:** the provider already has it. Revoke access as
   above and follow the provider's data-deletion process; the adapter cannot recall a result.

## Rollback

To the previous version: deploy the previous release's `mcp/` directory or image; the OAuth store is
compatible within the 0.73 line. To private only: remove `MCP_PUBLIC_URL` and the Caddy service. To no
MCP at all: stop the adapter and revoke its token. Atlas itself is never changed by any of this.
