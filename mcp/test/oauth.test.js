import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { AuthStore } from '../src/authStore.js';
import { readConfig } from '../src/config.js';
import { createHttpApp } from '../src/httpServer.js';
import { createLogger } from '../src/logger.js';
import { freePort } from './helpers.js';
import {
  authorize, consentPage, decide, initialize, MCP_HEADERS, mcpCall, pkce, REDIRECT_URI, register, registered, tokenRequest
} from './oauthFlow.js';

/*
  The adapter's OAuth 2.1 authorization server and protected resource in process, with a stand-in
  Atlas and a controllable clock: discovery, registration rules, consent and its CSRF defences,
  PKCE, code and refresh token replay, expiry, revocation by the client and by the owner, scopes and
  resources, session ownership, and that no Atlas or arbitrary bearer value is ever accepted.
*/
const TOKEN = `ial_${'a'.repeat(16)}_${'B'.repeat(43)}`;
let now = Date.now();
const clock = () => now;
let stateDir;
let store;
let server;
let base;
let logs;
const atlasCalls = [];
// Registered once: registration is rate limited per address (20 an hour), as it is in production.
const clients = {};

before(async () => {
  stateDir = await mkdtemp(path.join(os.tmpdir(), 'atlas-mcp-oauth-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const config = readConfig({ ATLAS_BASE_URL: 'http://127.0.0.1:9', ATLAS_API_TOKEN: TOKEN, MCP_PUBLIC_URL: base, MCP_STATE_DIR: stateDir, MCP_PORT: String(port) });
  store = new AuthStore(stateDir, { clock });
  logs = [];
  const atlas = {
    get: async segments => {
      atlasCalls.push(segments.join('/'));
      if (segments.join('/') === 'database/metadata') return { name: 'Synthetic <b>inventory</b>' };
      if (segments[0] === 'items') return { items: [], pagination: { page: 1, pages: 1, total: 0, pageSize: 10 } };
      return {};
    }
  };
  const { app, close } = createHttpApp({ config, atlas, logger: createLogger('debug', line => logs.push(line)), clock, authStore: store });
  const listener = await new Promise(resolve => { const instance = app.listen(port, '127.0.0.1', () => resolve(instance)); });
  server = { close, listener };
  for (const name of ['main', 'other', 'third', 'revoked']) clients[name] = await registered(base, { client_name: `Synthetic ${name} client` });
});

after(async () => {
  await server.close();
  server.listener.closeAllConnections();
  await new Promise(resolve => server.listener.close(resolve));
  store.close();
  await rm(stateDir, { recursive: true, force: true });
});

const enrollment = () => store.createEnrollmentCode().code;

async function session(token) {
  const opened = await initialize(base, token);
  assert.equal(opened.status, 200, `initialize answered ${opened.status}`);
  await fetch(`${base}/mcp`, { method: 'POST', headers: { ...MCP_HEADERS, authorization: `Bearer ${token}`, 'mcp-session-id': opened.session },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  return opened.session;
}

test('discovery: every MCP request needs a token, and the challenge leads to the metadata', async () => {
  const anonymous = await initialize(base);
  assert.equal(anonymous.status, 401, 'initialize itself needs authorization');
  assert.match(anonymous.challenge, /^Bearer /);
  assert.ok(anonymous.challenge.includes(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`));
  assert.ok(anonymous.challenge.includes('scope="inventory:read"'));
  assert.ok(!anonymous.body.includes('search_items'), 'no tool metadata is shown anonymously');
  for (const method of ['GET', 'DELETE']) assert.equal((await fetch(`${base}/mcp`, { method })).status, 401, method);
  assert.equal((await mcpCall(base, null, null, 'tools/list')).status, 401);

  for (const url of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
    const resource = await (await fetch(`${base}${url}`)).json();
    assert.equal(resource.resource, `${base}/mcp`, url);
    assert.deepEqual(resource.authorization_servers, [`${base}/`]);
    assert.deepEqual(resource.scopes_supported, ['inventory:read']);
  }
  // Forwarded headers never change the advertised addresses: they come from MCP_PUBLIC_URL only.
  const metadata = await (await fetch(`${base}/.well-known/oauth-authorization-server`, {
    headers: { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'http', forwarded: 'host=attacker.example' }
  })).json();
  assert.equal(metadata.issuer, `${base}/`);
  assert.equal(metadata.authorization_endpoint, `${base}/authorize`);
  assert.equal(metadata.token_endpoint, `${base}/token`);
  assert.equal(metadata.registration_endpoint, `${base}/register`);
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(metadata.grant_types_supported, ['authorization_code', 'refresh_token']);
  assert.deepEqual(metadata.response_types_supported, ['code']);
  assert.ok(!JSON.stringify(metadata).includes('attacker'));
  // A foreign Host header is refused before anything else (DNS rebinding).
  const http = await import('node:http');
  const status = await new Promise((resolve, reject) => {
    http.get(`${base}/.well-known/oauth-authorization-server`, { headers: { host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
});

test('registration accepts only safe redirect URIs and keeps no URL it would have to fetch', async () => {
  for (const redirect of ['http://client.example.com/cb', 'javascript:alert(1)', 'https://client.example.com/cb#frag', 'https://user:pw@client.example.com/cb', 'ftp://client.example.com/cb']) {
    assert.equal((await register(base, { redirect_uris: [redirect] })).status, 400, redirect);
  }
  assert.equal((await register(base, { redirect_uris: [] })).status, 400);
  assert.equal((await register(base, { redirect_uris: Array(6).fill(REDIRECT_URI) })).status, 400);
  assert.equal((await register(base, { grant_types: ['client_credentials'] })).status, 400);
  assert.equal((await register(base, { grant_types: ['authorization_code', 'implicit'] })).status, 400);
  assert.equal((await register(base, { response_types: ['token'] })).status, 400);
  assert.equal((await register(base, { scope: 'items:write' })).status, 400);

  const native = await registered(base, { redirect_uris: ['http://127.0.0.1:33418/callback'] });
  assert.deepEqual(native.redirect_uris, ['http://127.0.0.1:33418/callback'], 'a loopback redirect is fine for a native client');
  const hostile = await registered(base, {
    client_name: 'Evil\u202E client <script>', logo_uri: 'http://169.254.169.254/latest/meta-data', jwks_uri: 'http://127.0.0.1:3000/api/backup',
    client_uri: 'http://10.0.0.1/', policy_uri: 'http://localhost/'
  });
  assert.equal(hostile.client_name, 'Evil client <script>');
  for (const key of ['logo_uri', 'jwks_uri', 'client_uri', 'policy_uri']) assert.equal(hostile[key], undefined, `${key} is not kept`);
  assert.equal(hostile.scope, 'inventory:read');
  const page = await consentPage(base, hostile, { challenge: pkce().challenge });
  assert.ok(page.html.includes('Evil client &lt;script&gt;') && !page.html.includes('<script>'), 'the name is escaped');
  assert.ok(!page.html.includes('169.254'), 'nothing the client offered is loaded or linked');
  assert.ok(!atlasCalls.some(call => call.includes('backup')), 'the server never fetched a client-supplied address');

  const confidential = await registered(base, { token_endpoint_auth_method: 'client_secret_basic' });
  assert.equal(confidential.token_endpoint_auth_method, 'client_secret_post', 'confidential clients authenticate in the body');
  assert.match(confidential.client_secret, /^[0-9a-f]{64}$/);
  assert.equal(confidential.client_secret_expires_at, 0);
});

test('the authorization request is checked before any consent is shown', async () => {
  const client = clients.main;
  const { challenge } = pkce();
  // Unknown clients and unregistered redirect URIs are answered directly, never redirected.
  const unknown = await consentPage(base, { client_id: 'invented' }, { challenge });
  assert.equal(unknown.response.status, 400);
  const evil = await consentPage(base, client, { challenge, redirectUri: 'https://attacker.example/callback' });
  assert.equal(evil.response.status, 400);
  assert.equal(evil.response.headers.get('location'), null, 'a malicious redirect is never followed');

  const refusal = async options => {
    const page = await consentPage(base, client, { challenge, ...options });
    assert.equal(page.response.status, 302);
    return new URL(page.response.headers.get('location')).searchParams;
  };
  assert.equal((await refusal({ scope: 'inventory:read items:write' })).get('error'), 'invalid_scope');
  assert.equal((await refusal({ scope: 'admin' })).get('error'), 'invalid_scope');
  assert.equal((await refusal({ resource: 'https://other.example/mcp' })).get('error'), 'invalid_target');
  assert.equal((await refusal({ method: 'plain' })).get('error'), 'invalid_request', 'PKCE S256 only');
  assert.equal((await refusal({ challenge: undefined })).get('error'), 'invalid_request', 'PKCE is required');

  // No scope means inventory:read; the page shows the client, its return address, and the inventory.
  const page = await consentPage(base, client, { challenge, scope: undefined });
  assert.equal(page.response.status, 200);
  assert.match(page.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.response.headers.get('x-frame-options'), 'DENY');
  assert.match(page.cookie, /^atlas_mcp_consent=/);
  assert.match(page.response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  for (const text of ['Synthetic main client', 'client.example.com', 'inventory:read', 'Synthetic &lt;b&gt;inventory&lt;/b&gt;', client.client_id]) {
    assert.ok(page.html.includes(text), `the consent page shows ${text}`);
  }
});

test('consent needs this browser, this origin, and a valid one-time enrollment code', async () => {
  const client = clients.main;
  const { challenge } = pkce();
  const page = await consentPage(base, client, { challenge });
  const code = enrollment();

  assert.equal((await decide(base, page, { code, origin: 'https://attacker.example' })).status, 403, 'a cross-site form is refused');
  assert.equal((await decide(base, page, { code, origin: null })).status, 403, 'a request without Origin is refused');
  assert.equal((await decide(base, page, { code, cookie: null })).status, 400, 'another browser cannot complete it');
  assert.equal((await decide(base, page, { code, cookie: 'atlas_mcp_consent=forged' })).status, 400);
  assert.equal((await decide(base, page, { code, request: 'invented' })).status, 400);
  const wrong = await decide(base, page, { code: 'AAAA-BBBB-CCCC-DDDD-EEEE' });
  assert.equal(wrong.status, 400);
  assert.match(await wrong.text(), /wrong, expired, or already used/);

  // The real code still works after those refusals, exactly once.
  const approved = await decide(base, page, { code: code.toLowerCase().replaceAll('-', ' ') });
  assert.equal(approved.status, 303);
  assert.ok(new URL(approved.headers.get('location')).searchParams.get('code'));
  assert.equal((await decide(base, page, { code })).status, 400, 'a decided request cannot be decided again');
  const second = await consentPage(base, client, { challenge });
  assert.equal((await decide(base, second, { code })).status, 400, 'an enrollment code works once');

  // An expired code, and a code replaced by a newer one, do not work.
  const old = enrollment();
  now += 11 * 60 * 1000;
  const late = await consentPage(base, client, { challenge });
  assert.equal((await decide(base, late, { code: old })).status, 400, 'codes expire after ten minutes');
  const replaced = enrollment();
  enrollment();
  assert.equal((await decide(base, late, { code: replaced })).status, 400, 'only the latest printed code works');

  // Deny sends the owner's refusal back to the client.
  const denied = await decide(base, await consentPage(base, client, { challenge }), { decision: 'deny' });
  assert.equal(denied.status, 303);
  const location = new URL(denied.headers.get('location'));
  assert.deepEqual([location.searchParams.get('error'), location.searchParams.get('state')], ['access_denied', 'state-1']);

  // Five wrong codes end the request with access_denied.
  const guessed = await consentPage(base, client, { challenge });
  let last;
  for (let i = 0; i < 5; i += 1) last = await decide(base, guessed, { code: `AAAA-BBBB-CCCC-DDDD-EEE${i}` });
  assert.equal(new URL(last.headers.get('location')).searchParams.get('error'), 'access_denied');
  assert.ok(!logs.join('\n').includes(code.replaceAll('-', '')) && !logs.join('\n').includes(code), 'enrollment codes never reach the log');
});

test('the token endpoint enforces PKCE, the redirect URI, the resource, and single use', async () => {
  const client = clients.main;
  const issue = async () => {
    const { verifier, challenge } = pkce();
    const decision = await decide(base, await consentPage(base, client, { challenge }), { code: enrollment() });
    return { code: new URL(decision.headers.get('location')).searchParams.get('code'), verifier };
  };
  const exchange = (values, client_id = client.client_id) => tokenRequest(base, { grant_type: 'authorization_code', client_id, redirect_uri: REDIRECT_URI, ...values });

  const first = await issue();
  assert.equal((await exchange({ code: first.code, code_verifier: pkce().verifier })).status, 400, 'a wrong PKCE verifier is refused');
  assert.equal((await exchange({ code: first.code, code_verifier: first.verifier, redirect_uri: 'https://client.example.com/other' })).status, 400);
  assert.equal((await exchange({ code: first.code, code_verifier: first.verifier, resource: 'https://other.example/mcp' })).status, 400);
  const other = clients.other;
  assert.equal((await exchange({ code: first.code, code_verifier: first.verifier }, other.client_id)).status, 400, 'a code is bound to its client');
  // Three failed attempts already: one more burns the code even with the right verifier.
  assert.equal((await exchange({ code: first.code, code_verifier: first.verifier })).status, 400, 'a code with too many attempts is burned');

  const second = await issue();
  const granted = await exchange({ code: second.code, code_verifier: second.verifier, resource: `${base}/mcp` });
  assert.equal(granted.status, 200);
  const tokens = await granted.json();
  assert.match(tokens.access_token, /^amcp_at_/);
  assert.match(tokens.refresh_token, /^amcp_rt_/);
  assert.deepEqual([tokens.token_type, tokens.expires_in, tokens.scope], ['Bearer', 3600, 'inventory:read']);
  assert.equal((await initialize(base, tokens.access_token)).status, 200);

  // Redeeming the same code again is a replay: refused, and the tokens it produced are revoked.
  const replay = await exchange({ code: second.code, code_verifier: second.verifier });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, 'invalid_grant');
  assert.equal((await initialize(base, tokens.access_token)).status, 401, 'a replayed code revokes its grant');
  assert.match(logs.join('\n'), /authorization code replayed/);

  // Codes live for one minute.
  const third = await issue();
  now += 61 * 1000;
  assert.equal((await exchange({ code: third.code, code_verifier: third.verifier })).status, 400);
});

test('tools need a valid access token of this server; Atlas tokens and arbitrary bearers are refused', async () => {
  const { tokens } = await authorize(base, enrollment(), { client: clients.main });
  const id = await session(tokens.access_token);
  const listed = await mcpCall(base, tokens.access_token, id, 'tools/list');
  assert.equal(listed.json.result.tools.length, 6);
  const searched = await mcpCall(base, tokens.access_token, id, 'tools/call', { name: 'search_items', arguments: {} });
  assert.equal(searched.json.result.structuredContent.total, 0);

  const forged = [
    TOKEN, `amcp_at_${'A'.repeat(43)}`, tokens.refresh_token, 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9.', 'not-a-token', `${tokens.access_token}x`
  ];
  for (const bearer of forged) {
    for (const method of ['tools/list', 'tools/call']) {
      const refused = await mcpCall(base, bearer, id, method, { name: 'search_items', arguments: {} });
      assert.equal(refused.status, 401, `${method} with ${bearer.slice(0, 12)}…`);
      assert.match(refused.challenge, /error="invalid_token"/);
    }
  }
  assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { ...MCP_HEADERS, authorization: 'Basic dXNlcjpwYXNz' }, body: '{}' })).status, 401);

  // A session belongs to the client that opened it; another client's token cannot use its id.
  const intruder = await authorize(base, enrollment(), { client: clients.other });
  assert.equal((await mcpCall(base, intruder.tokens.access_token, id, 'tools/list')).status, 404);
  assert.equal((await fetch(`${base}/mcp`, { method: 'DELETE', headers: { ...MCP_HEADERS, authorization: `Bearer ${intruder.tokens.access_token}`, 'mcp-session-id': id } })).status, 404);
  assert.equal((await mcpCall(base, tokens.access_token, id, 'tools/list')).status, 200, 'the owner of the session still uses it');

  const log = logs.join('\n');
  assert.ok(!log.includes(tokens.access_token) && !log.includes(tokens.refresh_token), 'OAuth tokens never reach the log');
});

test('refresh tokens rotate, a reused one revokes the grant, and expiry ends access', async () => {
  const { client, tokens } = await authorize(base, enrollment(), { client: clients.main });
  const refresh = (refresh_token, values = {}) => tokenRequest(base, { grant_type: 'refresh_token', client_id: client.client_id, refresh_token, ...values });

  assert.equal((await refresh(tokens.refresh_token, { scope: 'inventory:read items:write' })).status, 400, 'a refresh cannot widen the scope');
  assert.equal((await refresh(tokens.refresh_token, { resource: 'https://other.example/mcp' })).status, 400);
  const other = clients.other;
  assert.equal((await tokenRequest(base, { grant_type: 'refresh_token', client_id: other.client_id, refresh_token: tokens.refresh_token })).status, 400,
    'a refresh token is bound to its client');
  assert.equal((await refresh(tokens.access_token)).status, 400, 'an access token is not a refresh token');

  const rotated = await (await refresh(tokens.refresh_token)).json();
  assert.notEqual(rotated.refresh_token, tokens.refresh_token);
  assert.equal((await initialize(base, tokens.access_token)).status, 401, 'the previous access token ends with the rotation');
  assert.equal((await initialize(base, rotated.access_token)).status, 200);

  // The spent refresh token presented again: refused, and the whole grant (the new pair too) is revoked.
  assert.equal((await refresh(tokens.refresh_token)).status, 400);
  assert.equal((await initialize(base, rotated.access_token)).status, 401);
  assert.equal((await refresh(rotated.refresh_token)).status, 400);
  assert.match(logs.join('\n'), /refresh token reused/);

  // Access tokens expire after their lifetime; refresh tokens after theirs.
  const fresh = await authorize(base, enrollment(), { client });
  now += 3601 * 1000;
  const expired = await initialize(base, fresh.tokens.access_token);
  assert.equal(expired.status, 401);
  assert.match(expired.challenge, /invalid_token/);
  const renewed = await (await refresh(fresh.tokens.refresh_token)).json();
  assert.equal((await initialize(base, renewed.access_token)).status, 200, 'a refresh reconnects after the access token expired');
  now += 31 * 86400 * 1000;
  assert.equal((await refresh(renewed.refresh_token)).status, 400, 'an unused refresh token expires');
});

test('a client revokes its own grant, and the owner revokes one client without touching others', async () => {
  const first = await authorize(base, enrollment(), { client: clients.main });
  const second = await authorize(base, enrollment(), { client: clients.revoked });
  const revoke = await fetch(`${base}/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: first.client.client_id, token: first.tokens.refresh_token }) });
  assert.equal(revoke.status, 200);
  assert.equal((await initialize(base, first.tokens.access_token)).status, 401, 'revoking the refresh token ends the access token too');
  // Another client cannot revoke someone else's token.
  await fetch(`${base}/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: first.client.client_id, token: second.tokens.access_token }) });
  assert.equal((await initialize(base, second.tokens.access_token)).status, 200);

  const third = await authorize(base, enrollment(), { client: clients.third });
  const id = await session(third.tokens.access_token);
  assert.equal(store.revokeClient(second.client.client_id), true);
  assert.equal((await initialize(base, second.tokens.access_token)).status, 401, 'the revoked client is out at once');
  assert.equal((await tokenRequest(base, { grant_type: 'refresh_token', client_id: second.client.client_id, refresh_token: second.tokens.refresh_token })).status, 400);
  assert.equal((await consentPage(base, second.client, { challenge: pkce().challenge })).response.status, 400, 'a revoked client cannot ask again');
  assert.equal((await mcpCall(base, third.tokens.access_token, id, 'tools/list')).status, 200, 'other clients keep working');
  const listed = store.listClients().find(client => client.clientId === second.client.client_id);
  assert.ok(listed.revokedAt && listed.activeGrants === 0);
});

test('the store keeps only hashes of tokens and codes', async () => {
  const { tokens, code } = await authorize(base, enrollment(), { client: clients.main });
  const dump = JSON.stringify([
    store.db.prepare('SELECT * FROM tokens').all(), store.db.prepare('SELECT * FROM authorization_codes').all(), store.db.prepare('SELECT * FROM enrollment_codes').all()
  ]);
  for (const value of [tokens.access_token, tokens.refresh_token, code]) assert.ok(!dump.includes(value));
});

test('registration is rate limited per client address', async () => {
  let status;
  for (let attempt = 0; attempt < 25 && status !== 429; attempt += 1) status = (await register(base)).status;
  assert.equal(status, 429);
});
