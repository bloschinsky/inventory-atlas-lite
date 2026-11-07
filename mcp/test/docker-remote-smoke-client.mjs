import { createHash, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/*
  Runs inside a container on the public side of the remote smoke stack (docker-remote-smoke.mjs):
  only Caddy is reachable from here. With an enrollment code it walks the whole OAuth flow
  (registration, consent, PKCE token exchange) and reads through the adapter; with an access token
  it only reads. It prints one JSON line; the token is returned to the host script, never logged.
*/
const [base, mode, secret] = process.argv.slice(2);
const REDIRECT = 'https://client.example.test/callback';

const reachable = async url => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
};

async function authorize(code) {
  const client = await (await fetch(`${base}/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Docker remote smoke', token_endpoint_auth_method: 'none' }) })).json();
  const verifier = randomBytes(32).toString('base64url');
  const url = new URL(`${base}/authorize`);
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, scope: 'inventory:read',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: `${base}/mcp`, state: 's' })) {
    url.searchParams.set(key, value);
  }
  const page = await fetch(url, { redirect: 'manual' });
  const request = (await page.text()).match(/name="request" value="([^"]+)"/)[1];
  const decision = await fetch(`${base}/consent`, { method: 'POST', redirect: 'manual', headers: {
    'content-type': 'application/x-www-form-urlencoded', origin: base, cookie: page.headers.get('set-cookie').split(';')[0]
  }, body: new URLSearchParams({ request, code, decision: 'approve' }) });
  const authorizationCode = new URL(decision.headers.get('location')).searchParams.get('code');
  const tokens = await (await fetch(`${base}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id, code: authorizationCode, code_verifier: verifier, redirect_uri: REDIRECT, resource: `${base}/mcp` }) })).json();
  return tokens.access_token;
}

const token = mode === 'enroll' ? await authorize(secret) : secret;
const anonymous = (await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status;

const client = new Client({ name: 'docker-remote-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
await client.connect(transport);
const tools = (await client.listTools()).tools.map(tool => tool.name).sort();
const found = (await client.callTool({ name: 'search_items', arguments: { query: 'Docker' } })).structuredContent.items.map(item => item.name);
await transport.terminateSession();
await client.close();

process.stdout.write(`${JSON.stringify({
  token, anonymous, tools, found,
  edge: {
    atlasApi: (await fetch(`${base}/api/health`)).status,
    readyz: (await fetch(`${base}/readyz`)).status,
    atlasDirect: await reachable('http://atlas:3000/api/health'),
    adapterDirect: await reachable('http://atlas-mcp:3100/healthz')
  }
})}\n`);
