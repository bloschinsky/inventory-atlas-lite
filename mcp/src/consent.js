import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { cleanText } from './mapping.js';

/*
  The owner's consent to one OAuth client. The SDK's /authorize validates the client and its redirect
  URI, then calls show(): the page names the client, its redirect address, the scope, and the target
  inventory, and asks for a one-time enrollment code that only someone with a shell on the adapter's
  host can print (`node src/cli.js enroll`). That code is the owner's proof: the adapter keeps no
  password of its own, never sees an Atlas password, and never touches Atlas's session cookies.

  The decision is a form POST to /consent, accepted only with the pending request's id, the
  browser-bound cookie set when the page was shown (another browser cannot complete it), an Origin of
  this server, and the code; a few wrong codes end the request. Approve redirects to the client with a
  single-use authorization code; Deny redirects with access_denied. Pending requests live in memory
  for ten minutes.
*/
const PENDING_TTL_MS = 10 * 60 * 1000;
export const MAX_PENDING = 50;
// One client keeps at most this many open requests; a new one replaces its oldest.
export const MAX_PENDING_PER_CLIENT = 3;
const MAX_CODE_TRIES = 5;
// The inventory name shown on the page is read from Atlas at most once a minute, whatever the traffic.
const NAME_CACHE_MS = 60 * 1000;

const hash = value => createHash('sha256').update(value).digest('hex');
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const cookieValue = (req, name) => {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
};

const STYLE = `
  :root { color-scheme: light dark; --bg: #f6f8fb; --card: #fff; --text: #1d273b; --muted: #667382; --line: #dce1e7; --accent: #206bc4; --danger: #d63939; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151f2c; --card: #1d2a3a; --text: #f1f5f9; --muted: #9aa8b6; --line: #2c3c50; --accent: #4f8fe0; --danger: #f06565; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 34rem; margin: 2rem auto; padding: 0 1rem; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0 0 1rem; }
  dl { margin: 0 0 1rem; } dt { color: var(--muted); font-size: .875rem; } dd { margin: 0 0 .75rem; overflow-wrap: anywhere; }
  label { display: block; font-weight: 600; margin-bottom: .25rem; }
  input { width: 100%; padding: .5rem .75rem; font: inherit; letter-spacing: .05em; border: 1px solid var(--line); border-radius: 4px; background: var(--bg); color: var(--text); }
  .hint { color: var(--muted); font-size: .875rem; margin: .25rem 0 1rem; }
  .error { color: var(--danger); font-weight: 600; }
  .actions { display: flex; gap: .75rem; flex-wrap: wrap; }
  button { font: inherit; padding: .5rem 1rem; border-radius: 4px; border: 1px solid var(--line); background: var(--card); color: var(--text); cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  code { overflow-wrap: anywhere; }
`;

function page(res, status, title, body) {
  const nonce = randomBytes(16).toString('base64');
  res.status(status)
    .set('content-type', 'text/html; charset=utf-8')
    .set('cache-control', 'no-store')
    .set('content-security-policy', `default-src 'none'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`)
    .set('x-frame-options', 'DENY')
    .set('x-content-type-options', 'nosniff')
    .set('referrer-policy', 'no-referrer')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><style nonce="${nonce}">${STYLE}</style></head><body><main><div class="card">${body}</div></main></body></html>`);
}

const message = (res, status, title, text) => page(res, status, title, `<h1>${escape(title)}</h1><p>${escape(text)}</p>`);

export function createConsent({ store, atlas, oauth, logger, clock = Date.now }) {
  const pending = new Map();
  const secure = oauth.issuerUrl.startsWith('https:');
  // __Host- keeps the cookie on this exact origin over HTTPS; a loopback test origin cannot use the prefix.
  const cookieName = secure ? '__Host-atlas_mcp_consent' : 'atlas_mcp_consent';

  const sweep = () => {
    for (const [id, request] of pending) if (request.expiresAt <= clock()) pending.delete(id);
  };

  /*
    The inventory's name as Atlas reports it, shown so the owner knows which inventory is shared.
    Anonymous page views must not turn into Atlas traffic: one read is shared by every request that
    arrives while it runs, and its answer (or failure) is reused for a minute.
  */
  let nameCache = null;
  const inventoryName = () => {
    if (nameCache && (nameCache.pending || clock() - nameCache.at < NAME_CACHE_MS)) return nameCache.value;
    const value = atlas.get(['database', 'metadata'])
      .then(metadata => cleanText(metadata?.name, 100), () => null)
      .finally(() => { nameCache = { value, at: clock(), pending: false }; });
    nameCache = { value, at: clock(), pending: true };
    return value;
  };
  // Places taken by requests whose page is still being prepared; they count against MAX_PENDING.
  let reserving = 0;

  function render(res, request, client, { error = null, status = 200 } = {}) {
    const redirect = new URL(request.redirectUri);
    page(res, status, 'Allow access to Inventory Atlas?', `
<h1>Allow ${escape(client.client_name)} to read this inventory?</h1>
<dl>
  <dt>Client</dt><dd>${escape(client.client_name)} <br><code>${escape(client.client_id)}</code></dd>
  <dt>Returns to</dt><dd><strong>${escape(redirect.host)}</strong> <br><code>${escape(request.redirectUri)}</code></dd>
  <dt>Access</dt><dd><code>inventory:read</code> — search and read items, categories, history, and Dashboard figures. It cannot change anything.</dd>
  <dt>Inventory</dt><dd>${escape(request.inventory ?? 'Inventory Atlas')} <br><code>${escape(oauth.resourceUrl)}</code></dd>
  <dt>Privacy</dt><dd>The records it reads (never photos) are sent to the provider of this client and handled under its terms.</dd>
</dl>
<form method="post" action="/consent">
  <input type="hidden" name="request" value="${escape(request.id)}">
  <label for="code">Enrollment code</label>
  <input id="code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" maxlength="40">
  <p class="hint">Print one on the adapter's host: <code>node src/cli.js enroll</code>. It works once, for ten minutes.</p>
  ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
  <div class="actions">
    <button class="primary" type="submit" name="decision" value="approve">Allow read access</button>
    <button type="submit" name="decision" value="deny">Deny</button>
  </div>
</form>`);
  }

  /*
    The place is reserved before the only await, so simultaneous requests can never hold more than
    MAX_PENDING between them, and it is released whatever happens. One client cannot fill the table:
    its oldest open request gives way to its newest.
  */
  async function show(client, params, res) {
    sweep();
    if (pending.size + reserving >= MAX_PENDING) {
      logger.warn('oauth consent refused: too many open authorization requests', { client_id: client.client_id });
      return message(res, 503, 'Try again later', 'Too many authorization requests are waiting. Try again in a few minutes.');
    }
    reserving += 1;
    let inventory;
    try {
      inventory = await inventoryName();
    } finally {
      reserving -= 1;
    }
    // A browser that left while the page was prepared gets nothing, and nothing is kept for it.
    if (res.destroyed || res.writableEnded) return;
    // Applied where the request is added, after the await, so a burst cannot exceed it either.
    const own = [...pending.values()].filter(request => request.clientId === client.client_id).sort((a, b) => a.expiresAt - b.expiresAt);
    for (const stale of own.slice(0, Math.max(0, own.length - MAX_PENDING_PER_CLIENT + 1))) pending.delete(stale.id);
    const id = randomBytes(24).toString('base64url');
    const browser = randomBytes(24).toString('base64url');
    const request = {
      id, clientId: client.client_id, redirectUri: params.redirectUri, state: params.state, scopes: params.scopes,
      codeChallenge: params.codeChallenge, browserHash: hash(browser), expiresAt: clock() + PENDING_TTL_MS, tries: 0, inventory
    };
    pending.set(id, request);
    res.set('set-cookie', `${cookieName}=${browser}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${PENDING_TTL_MS / 1000}${secure ? '; Secure' : ''}`);
    render(res, request, client);
  }

  const back = (res, request, values) => {
    const url = new URL(request.redirectUri);
    for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
    if (request.state !== undefined) url.searchParams.set('state', request.state);
    res.set('cache-control', 'no-store').redirect(303, url.href);
  };

  const router = express.Router();
  router.post('/consent',
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
      handler: (_req, res) => message(res, 429, 'Too many attempts', 'Wait a few minutes before trying again.') }),
    express.urlencoded({ extended: false, limit: '4kb' }),
    (req, res) => {
      sweep();
      // A cross-site page can post a form, but not with this server's Origin.
      if (req.headers.origin !== oauth.issuerUrl) return message(res, 403, 'Request refused', 'This form can only be sent from its own page.');
      const request = pending.get(String(req.body?.request ?? ''));
      const browser = cookieValue(req, cookieName);
      if (!request || !browser || !sameHash(hash(browser), request.browserHash)) {
        return message(res, 400, 'Request expired', 'This authorization request has expired or belongs to another browser. Start again from your MCP client.');
      }
      const client = store.getClient(request.clientId);
      if (!client) {
        pending.delete(request.id);
        return message(res, 400, 'Client unavailable', 'This client was revoked or removed. Start again from your MCP client.');
      }
      if (req.body.decision === 'deny') {
        pending.delete(request.id);
        logger.info('oauth consent denied', { client_id: client.client_id });
        return back(res, request, { error: 'access_denied', error_description: 'The owner denied access.' });
      }
      if (req.body.decision !== 'approve') return message(res, 400, 'Request refused', 'Choose Allow or Deny.');
      if (!store.consumeEnrollmentCode(req.body.code, client.client_id)) {
        request.tries += 1;
        logger.warn('oauth consent refused: wrong or expired enrollment code', { client_id: client.client_id, tries: request.tries });
        if (request.tries >= MAX_CODE_TRIES) {
          pending.delete(request.id);
          return back(res, request, { error: 'access_denied', error_description: 'Too many wrong enrollment codes.' });
        }
        return render(res, request, client, { status: 400, error: 'This code is wrong, expired, or already used. Print a new one on the host.' });
      }
      pending.delete(request.id);
      store.approveClient(client.client_id);
      const code = store.createAuthorizationCode({
        clientId: client.client_id, redirectUri: request.redirectUri, codeChallenge: request.codeChallenge, scopes: request.scopes, resource: oauth.resourceUrl
      });
      logger.info('oauth consent approved', { client_id: client.client_id, client_name: client.client_name });
      back(res, request, { code });
    });

  return { show, router, pending, reserving: () => reserving };
}
