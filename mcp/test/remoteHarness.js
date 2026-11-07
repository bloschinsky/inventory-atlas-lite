import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCP_DIR } from './helpers.js';
import { decide, REDIRECT_URI } from './oauthFlow.js';

/*
  The remote side of the end-to-end tests (remote.test.js, acceptance.test.js): a TLS reverse proxy
  that publishes only the paths of mcp/deploy/Caddyfile, the adapter's command line, and the OAuth
  client side of the official MCP SDK with the test playing the owner's browser.
*/

// A self-signed certificate for localhost that exists only for these tests; this process trusts it.
const CERT = readFileSync(new URL('./fixtures/tls/localhost.crt', import.meta.url), 'utf8');
const KEY = readFileSync(new URL('./fixtures/tls/localhost.key', import.meta.url), 'utf8');
tls.setDefaultCACertificates([...tls.getCACertificates('default'), CERT]);

// The paths a reverse proxy may publish (see mcp/deploy/Caddyfile); everything else is 404 at the edge.
export const PUBLISHED = /^\/(mcp|authorize|consent|token|register|revoke|\.well-known\/(oauth-protected-resource(\/mcp)?|oauth-authorization-server))(\?|$)/;

export function startProxy(port, upstreamPort) {
  const server = https.createServer({ key: KEY, cert: CERT }, (req, res) => {
    if (!PUBLISHED.test(req.url)) {
      res.writeHead(404).end();
      return;
    }
    const upstream = http.request({
      host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url,
      headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress, 'x-forwarded-proto': 'https' }
    }, answer => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    // The adapter can stop in the middle of an answer (a restart test); then the answer just ends.
    upstream.on('error', () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
    req.pipe(upstream);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

export async function stopProxy(server) {
  if (!server) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

// `node src/cli.js …` on the adapter's host, against one OAuth store.
export const cli = (stateDir, ...args) => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/cli.js', ...args], {
  cwd: MCP_DIR, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, MCP_STATE_DIR: stateDir }, encoding: 'utf8'
});
export const enroll = stateDir => cli(stateDir, 'enroll').match(/^Enrollment code: (\S+)$/m)[1];

// The OAuth client side of the official SDK; the test is the browser that opens the authorization URL.
export class HarnessProvider {
  constructor(name = 'SDK harness') {
    this.name = name;
    this.saved = {};
  }
  get redirectUrl() { return REDIRECT_URI; }
  get clientMetadata() {
    return { client_name: this.name, redirect_uris: [REDIRECT_URI], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
  }
  clientInformation() { return this.saved.client; }
  saveClientInformation(client) { this.saved.client = client; }
  tokens() { return this.saved.tokens; }
  saveTokens(tokens) { this.saved.tokens = tokens; }
  redirectToAuthorization(url) { this.authorizationUrl = url; }
  saveCodeVerifier(verifier) { this.saved.verifier = verifier; }
  codeVerifier() { return this.saved.verifier; }
}

// The owner's browser: opens the consent page of `authorizationUrl`, types the code, and approves.
export async function approveInBrowser(authorizationUrl, publicUrl, enrollmentCode) {
  const page = await fetch(authorizationUrl, { redirect: 'manual' });
  const html = await page.text();
  assert.equal(page.status, 200, 'the consent page is shown');
  const approved = await decide(publicUrl, {
    request: html.match(/name="request" value="([^"]+)"/)[1], cookie: page.headers.get('set-cookie').split(';')[0]
  }, { code: enrollmentCode });
  assert.equal(approved.status, 303, 'approval redirects back to the client');
  return { page, html, code: new URL(approved.headers.get('location')).searchParams.get('code') };
}

/*
  The whole first connection of an SDK client: discovery and registration inside connect(), which
  stops at the browser step, the owner's approval, the token exchange, and a connected client.
*/
export async function connectWithOAuth(publicUrl, stateDir, provider = new HarnessProvider()) {
  const endpoint = new URL(`${publicUrl}/mcp`);
  const first = new Client({ name: 'atlas-mcp-remote', version: '1.0.0' });
  await assert.rejects(first.connect(new StreamableHTTPClientTransport(endpoint, { authProvider: provider })), UnauthorizedError);
  const { code } = await approveInBrowser(provider.authorizationUrl, publicUrl, enroll(stateDir));
  const transport = new StreamableHTTPClientTransport(endpoint, { authProvider: provider });
  await transport.finishAuth(code);
  return { provider, ...await reconnect(publicUrl, provider) };
}

// A new MCP session for a client that already holds tokens, as a connector does after a restart.
export async function reconnect(publicUrl, provider) {
  const transport = new StreamableHTTPClientTransport(new URL(`${publicUrl}/mcp`), { authProvider: provider });
  const client = new Client({ name: 'atlas-mcp-remote', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport, close: async () => { await transport.terminateSession().catch(() => {}); await client.close(); } };
}
