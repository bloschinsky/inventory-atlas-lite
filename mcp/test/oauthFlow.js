import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

/*
  A plain-HTTP walk through the adapter's OAuth flow, shared by the OAuth tests: client
  registration, the authorization request and its consent page, the owner's decision, and the token
  request with PKCE. Every step returns the raw response so tests can also check refusals.
*/
export const REDIRECT_URI = 'https://client.example.com/oauth/callback';
export const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

export const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

export const form = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined));

export async function register(base, metadata = {}, { fetchImpl = fetch } = {}) {
  return fetchImpl(`${base}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: 'Synthetic test client', token_endpoint_auth_method: 'none', ...metadata })
  });
}

export async function registered(base, metadata, options) {
  const response = await register(base, metadata, options);
  assert.equal(response.status, 201, `registration answered ${response.status}`);
  return response.json();
}

export function authorizeUrl(base, client, { redirectUri = REDIRECT_URI, challenge, scope = 'inventory:read', resource = `${base}/mcp`, state = 'state-1', method = 'S256' } = {}) {
  const url = new URL(`${base}/authorize`);
  for (const [key, value] of Object.entries({
    response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: method, scope, resource, state
  })) if (value !== undefined) url.searchParams.set(key, value);
  return url;
}

// Opens the consent page; returns the response, its request id, and the browser cookie it set.
export async function consentPage(base, client, options, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(authorizeUrl(base, client, options), { redirect: 'manual' });
  const html = response.status === 200 ? await response.text() : '';
  return {
    response, html,
    request: html.match(/name="request" value="([^"]+)"/)?.[1] ?? null,
    cookie: response.headers.getSetCookie?.().map(cookie => cookie.split(';')[0]).find(cookie => /atlas_mcp_consent=/.test(cookie)) ?? null
  };
}

export async function decide(base, page, { code, decision = 'approve', origin = base, cookie = page.cookie, request = page.request } = {}, { fetchImpl = fetch } = {}) {
  return fetchImpl(`${base}/consent`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
    body: form({ request, code, decision })
  });
}

export const tokenRequest = (base, values, { fetchImpl = fetch } = {}) => fetchImpl(`${base}/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(values)
});

// The whole happy path: registration (unless a client is given), consent with `code`, and the token pair.
export async function authorize(base, enrollmentCode, { client, fetchImpl = fetch } = {}) {
  const app = client ?? await registered(base, {}, { fetchImpl });
  const { verifier, challenge } = pkce();
  const page = await consentPage(base, app, { challenge }, { fetchImpl });
  assert.equal(page.response.status, 200, 'the consent page is shown');
  const decision = await decide(base, page, { code: enrollmentCode }, { fetchImpl });
  assert.equal(decision.status, 303, 'approval redirects back to the client');
  const location = new URL(decision.headers.get('location'));
  assert.equal(`${location.origin}${location.pathname}`, REDIRECT_URI);
  assert.equal(location.searchParams.get('state'), 'state-1');
  const code = location.searchParams.get('code');
  const response = await tokenRequest(base, {
    grant_type: 'authorization_code', client_id: app.client_id, code, code_verifier: verifier, redirect_uri: REDIRECT_URI, resource: `${base}/mcp`
  }, { fetchImpl });
  assert.equal(response.status, 200, 'the code is exchanged for tokens');
  return { client: app, code, verifier, tokens: await response.json() };
}

const rpc = (id, method, params = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });

// An MCP initialize with an optional access token; returns the status, session id, and challenge header.
export async function initialize(base, token, { fetchImpl = fetch, headers = {} } = {}) {
  const response = await fetchImpl(`${base}/mcp`, {
    method: 'POST', headers: { ...MCP_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: rpc(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'oauth-test', version: '1' } })
  });
  const body = await response.text();
  return { status: response.status, session: response.headers.get('mcp-session-id'), challenge: response.headers.get('www-authenticate'), body };
}

export async function mcpCall(base, token, session, method, params, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${base}/mcp`, {
    method: 'POST',
    headers: { ...MCP_HEADERS, 'mcp-protocol-version': '2025-11-25', ...(session ? { 'mcp-session-id': session } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: rpc(2, method, params)
  });
  const text = await response.text();
  // A JSON answer, or the data line of a one-message event stream.
  const json = text.startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find(line => line.startsWith('data: '))?.slice(6) ?? 'null');
  return { status: response.status, json, challenge: response.headers.get('www-authenticate') };
}
