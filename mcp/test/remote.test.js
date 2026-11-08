import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { freePort, json, REPO_DIR, startMcp, waitFor } from './helpers.js';
import { consentPage, decide, initialize, pkce, REDIRECT_URI } from './oauthFlow.js';
import { approveInBrowser, cli as cliIn, enroll as enrollIn, HarnessProvider, startProxy, stopProxy } from './remoteHarness.js';

/*
  Remote access end to end: a real Atlas with a synthetic inventory, the adapter as its own process
  in OAuth mode, and a TLS reverse proxy in front that publishes only the MCP and OAuth paths (as the
  shipped Caddyfile does). The official MCP SDK client discovers the authorization server, registers
  itself, is approved on the consent page with a code from `cli.js enroll`, and reads Atlas over HTTPS.
  Atlas's REST API and UI are not reachable through the proxy, the Atlas token never leaves the
  adapter, and an overprivileged or revoked Atlas token fails closed.
*/
process.chdir(REPO_DIR);
const { startServer, stopServer } = await import('../../test/serverProcess.js');

let dataDir;
let stateDir;
let atlas;
let proxy;
let mcp;
let publicUrl;
let readToken;

const request = async (url, options) => {
  const response = await atlas.fetch(`${atlas.base}${url}`, options);
  assert.ok(response.ok, `${options?.method ?? 'GET'} ${url} answered ${response.status}`);
  return response.status === 204 ? null : response.json();
};

const enroll = () => enrollIn(stateDir);
const cli = (...args) => cliIn(stateDir, ...args);

const startAdapter = token => startMcp({
  ATLAS_BASE_URL: atlas.base, ATLAS_API_TOKEN: token, MCP_PUBLIC_URL: publicUrl, MCP_STATE_DIR: stateDir, MCP_TRUST_PROXY: 'loopback'
});

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'atlas-mcp-remote-'));
  stateDir = await mkdtemp(path.join(os.tmpdir(), 'atlas-mcp-remote-state-'));
  atlas = await startServer(dataDir, { environment: { PORT: String(await freePort()) } });
  const category = await request('/api/categories', json('POST', { name: 'Synthetic gear' }));
  await request('/api/items', json('POST', { name: 'Synthetic tripod', category_id: category.id, location: 'Hall closet' }));
  readToken = (await request('/api/security/tokens', json('POST', { name: 'MCP remote', scopes: ['inventory:read'] }))).token;

  const proxyPort = await freePort();
  const mcpPort = await freePort();
  publicUrl = `https://localhost:${proxyPort}`;
  mcp = startMcp({
    ATLAS_BASE_URL: atlas.base, ATLAS_API_TOKEN: readToken, MCP_PORT: String(mcpPort),
    MCP_PUBLIC_URL: publicUrl, MCP_STATE_DIR: stateDir, MCP_TRUST_PROXY: 'loopback'
  });
  await mcp.ready;
  proxy = await startProxy(proxyPort, mcpPort);
});

after(async () => {
  await mcp?.stop();
  await stopProxy(proxy);
  if (atlas) await stopServer(atlas.child);
  await rm(dataDir, { recursive: true, force: true });
  await rm(stateDir, { recursive: true, force: true });
});

test('an official MCP client authorizes over HTTPS through the proxy and reads Atlas', async () => {
  const provider = new HarnessProvider();
  const endpoint = new URL(`${publicUrl}/mcp`);
  const first = new Client({ name: 'atlas-mcp-remote', version: '1.0.0' });
  // Discovery and registration happen inside connect(); it stops at the browser step.
  await assert.rejects(first.connect(new StreamableHTTPClientTransport(endpoint, { authProvider: provider })), UnauthorizedError);
  assert.ok(provider.saved.client?.client_id, 'the client registered itself');
  const authorization = provider.authorizationUrl;
  assert.equal(authorization.origin, publicUrl);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('resource'), `${publicUrl}/mcp`, 'the client asks for a token bound to this resource');

  // The owner approves in the browser with a code printed on the host.
  const { page, code } = await approveInBrowser(authorization, publicUrl, enroll());
  assert.match(page.headers.get('set-cookie'), /^__Host-atlas_mcp_consent=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=600; Secure/);

  const transport = new StreamableHTTPClientTransport(endpoint, { authProvider: provider });
  await transport.finishAuth(code);
  assert.match(provider.saved.tokens.access_token, /^amcp_at_/);
  const client = new Client({ name: 'atlas-mcp-remote', version: '1.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 6);
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint === true));
    const found = await client.callTool({ name: 'search_items', arguments: { query: 'tripod' } });
    assert.deepEqual(found.structuredContent.items.map(item => [item.name, item.effective_location]), [['Synthetic tripod', 'Hall closet']]);
  } finally {
    await transport.terminateSession();
    await client.close();
  }

  // The owner sees the client, then revokes it: its token stops at once.
  assert.match(cli('clients'), new RegExp(`${provider.saved.client.client_id}\\tapproved\\tSDK harness`));
  assert.equal((await initialize(publicUrl, provider.saved.tokens.access_token)).status, 200);
  assert.match(cli('revoke', provider.saved.client.client_id), /Revoked/);
  assert.equal((await initialize(publicUrl, provider.saved.tokens.access_token)).status, 401);

  const log = mcp.logs.join('\n');
  for (const secret of [readToken, readToken.split('_').slice(2).join('_'), provider.saved.tokens.access_token, provider.saved.tokens.refresh_token]) {
    assert.ok(!log.includes(secret), 'no Atlas or OAuth token in the log');
  }
  assert.ok(!log.includes('Synthetic tripod') && !log.includes('Hall closet'), 'no inventory text in the log');
});

test('only the MCP and OAuth paths are published; Atlas stays private', async () => {
  for (const url of ['/api/items', '/api/auth/session', '/api/health', '/', '/login', '/healthz', '/readyz', '/mcp/../api/items']) {
    assert.equal((await fetch(`${publicUrl}${url}`)).status, 404, url);
  }
  // The adapter itself passes nothing through to Atlas either.
  const direct = `http://127.0.0.1:${new URL(mcp.logs.join('\n').match(/listening on (http:\/\/[^\s"]+)/)[1]).port}`;
  for (const url of ['/api/items', '/api/backup']) assert.equal((await fetch(`${direct}${url}`)).status, 404, url);
  // Forwarded headers from outside do not change the advertised issuer or resource.
  const metadata = await (await fetch(`${publicUrl}/.well-known/oauth-protected-resource/mcp`, { headers: { 'x-forwarded-host': 'attacker.example' } })).json();
  assert.equal(metadata.resource, `${publicUrl}/mcp`);
  const challenge = (await initialize(publicUrl)).challenge;
  assert.ok(challenge.includes(`resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"`));
  // A consent form posted from a page of another origin through the proxy is refused.
  const client = await (await fetch(`${publicUrl}/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'Proxy check', token_endpoint_auth_method: 'none' }) })).json();
  const page = await consentPage(publicUrl, client, { challenge: pkce().challenge });
  assert.equal((await decide(publicUrl, page, { code: enroll(), origin: 'https://attacker.example' })).status, 403);
});

test('an Atlas token that can write stops the adapter, and a revoked one fails closed', async () => {
  const write = (await request('/api/security/tokens', json('POST', { name: 'MCP too strong', scopes: ['items:write'] }))).token;
  const refused = startAdapter(write);
  await assert.rejects(refused.ready, error => error.code === 3);
  assert.match(refused.logs.join('\n'), /"reason":"token_overprivileged"/);
  assert.ok(!refused.logs.join('\n').includes(write.split('_').slice(2).join('_')));

  const { token, apiToken } = await request('/api/security/tokens', json('POST', { name: 'MCP soon revoked', scopes: ['inventory:read'] }));
  const adapter = startAdapter(token);
  try {
    const local = await adapter.ready;
    assert.deepEqual(await (await fetch(`${local}/readyz`)).json(), { status: 'ready' });
    await request(`/api/security/tokens/${apiToken.id}`, { method: 'DELETE' });
    await waitFor(async () => (await fetch(`${local}/readyz`)).status === 503, { message: 'readiness to drop' });
    assert.deepEqual(await (await fetch(`${local}/readyz`)).json(), { status: 'not_ready', reason: 'auth_rejected' });
  } finally {
    await adapter.stop();
  }
});
