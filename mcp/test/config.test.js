import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readConfig } from '../src/config.js';

const TOKEN = `ial_${'a'.repeat(16)}_${'B'.repeat(43)}`;
const base = { ATLAS_BASE_URL: 'http://127.0.0.1:3000', ATLAS_API_TOKEN: TOKEN };

test('defaults listen on loopback only with DNS rebinding protection', () => {
  const config = readConfig(base);
  assert.equal(config.listen.host, '127.0.0.1');
  assert.equal(config.listen.port, 3100);
  assert.deepEqual(config.listen.allowedHosts, ['127.0.0.1', 'localhost', '[::1]']);
  assert.equal(config.atlas.baseUrl, 'http://127.0.0.1:3000');
  assert.equal(config.atlas.timeoutMs, 10000);
  assert.equal(config.atlas.maxConcurrency, 4);
});

test('a missing or malformed token stops startup without echoing it', () => {
  assert.throws(() => readConfig({ ATLAS_BASE_URL: base.ATLAS_BASE_URL }), /ATLAS_API_TOKEN or ATLAS_API_TOKEN_FILE is required/);
  const typo = `${TOKEN}!`;
  assert.throws(() => readConfig({ ...base, ATLAS_API_TOKEN: typo }), error => !error.message.includes(typo) && /malformed/.test(error.message));
  assert.throws(() => readConfig({ ...base, ATLAS_API_TOKEN: 'secret' }), /malformed/);
  assert.throws(() => readConfig({ ...base, ATLAS_API_TOKEN_FILE: '/x' }), /not both/);
});

test('the token can come from a secret file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'atlas-mcp-config-'));
  try {
    const file = path.join(dir, 'token');
    await writeFile(file, `${TOKEN}\n`);
    assert.ok(readConfig({ ATLAS_BASE_URL: base.ATLAS_BASE_URL, ATLAS_API_TOKEN_FILE: file }).atlas.token === TOKEN);
    assert.throws(() => readConfig({ ATLAS_BASE_URL: base.ATLAS_BASE_URL, ATLAS_API_TOKEN_FILE: path.join(dir, 'missing') }), /cannot be read/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the Atlas address is validated strictly', () => {
  for (const url of ['', 'ftp://atlas.example', 'http://user:pw@atlas.example', 'http://atlas.example/?a=1', 'http://atlas.example/#x', 'nope']) {
    assert.throws(() => readConfig({ ...base, ATLAS_BASE_URL: url }), /ATLAS_BASE_URL/, url);
  }
  assert.equal(readConfig({ ...base, ATLAS_BASE_URL: 'https://atlas.example/' }).atlas.baseUrl, 'https://atlas.example');
});

test('a non-loopback interface needs an explicit host allowlist', () => {
  assert.throws(() => readConfig({ ...base, MCP_HOST: '0.0.0.0' }), /MCP_ALLOWED_HOSTS/);
  assert.throws(() => readConfig({ ...base, MCP_HOST: 'atlas.example' }), /IP address or localhost/);
  assert.throws(() => readConfig({ ...base, MCP_HOST: '0.0.0.0', MCP_ALLOWED_HOSTS: 'bad host' }), /not a host name/);
  const config = readConfig({ ...base, MCP_HOST: '0.0.0.0', MCP_ALLOWED_HOSTS: 'atlas-mcp, Atlas-MCP' });
  assert.deepEqual(config.listen.allowedHosts, ['127.0.0.1', 'localhost', '[::1]', 'atlas-mcp']);
});

test('limits are integers inside their ranges', () => {
  for (const [name, value] of [['ATLAS_TIMEOUT_MS', '10'], ['ATLAS_TIMEOUT_MS', '5s'], ['ATLAS_MAX_CONCURRENCY', '0'],
    ['ATLAS_MAX_RESPONSE_BYTES', '1'], ['MCP_PORT', '70000'], ['MCP_MAX_SESSIONS', '-1'], ['MCP_LOG_LEVEL', 'trace']]) {
    assert.throws(() => readConfig({ ...base, [name]: value }), new RegExp(name), `${name}=${value}`);
  }
  assert.equal(readConfig({ ...base, ATLAS_TIMEOUT_MS: '2500' }).atlas.timeoutMs, 2500);
});

test('remote access needs an HTTPS origin and a state directory, and turns OAuth on', () => {
  assert.equal(readConfig(base).oauth, null, 'without MCP_PUBLIC_URL the adapter stays private and has no OAuth');
  const remote = readConfig({ ...base, MCP_PUBLIC_URL: 'https://mcp.example.com', MCP_STATE_DIR: '/var/lib/atlas-mcp', MCP_HOST: '0.0.0.0' });
  assert.deepEqual({ ...remote.oauth }, {
    issuerUrl: 'https://mcp.example.com', resourceUrl: 'https://mcp.example.com/mcp', stateDir: '/var/lib/atlas-mcp',
    accessTokenSeconds: 3600, refreshTokenSeconds: 30 * 86400
  });
  assert.ok(remote.listen.allowedHosts.includes('mcp.example.com'), 'the public host is an accepted Host header');
  assert.equal(remote.trustProxy, false, 'no proxy is trusted unless named');

  const state = { MCP_STATE_DIR: '/var/lib/atlas-mcp' };
  assert.throws(() => readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'http://mcp.example.com' }), /must use https/);
  assert.throws(() => readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'https://mcp.example.com/mcp' }), /origin only/);
  assert.throws(() => readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'https://user:pw@mcp.example.com' }), /origin only/);
  assert.throws(() => readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'https://mcp.example.com/?x=1' }), /origin only/);
  assert.throws(() => readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'not a url' }), /not a valid URL/);
  assert.throws(() => readConfig({ ...base, MCP_PUBLIC_URL: 'https://mcp.example.com' }), /MCP_STATE_DIR is required/);
  // Plain HTTP only for a test on the same machine.
  assert.equal(readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'http://localhost:8443' }).oauth.resourceUrl, 'http://localhost:8443/mcp');
  assert.equal(readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'https://mcp.example.com', MCP_ACCESS_TOKEN_SECONDS: '600' }).oauth.accessTokenSeconds, 600);
  assert.throws(() => readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'https://mcp.example.com', MCP_ACCESS_TOKEN_SECONDS: '60' }), /MCP_ACCESS_TOKEN_SECONDS/);
  assert.throws(() => readConfig({ ...base, ...state, MCP_PUBLIC_URL: 'https://mcp.example.com', MCP_REFRESH_TOKEN_DAYS: '365' }), /MCP_REFRESH_TOKEN_DAYS/);
});

test('only named reverse proxies are trusted for forwarded client addresses', () => {
  assert.deepEqual([...readConfig({ ...base, MCP_TRUST_PROXY: 'loopback, 172.30.0.0/24,::1' }).trustProxy], ['loopback', '172.30.0.0/24', '::1']);
  for (const value of ['true', '*', '10.0.0.0/33', '10.0.0.0/8/1', 'proxy.example.com']) {
    assert.throws(() => readConfig({ ...base, MCP_TRUST_PROXY: value }), /MCP_TRUST_PROXY/, value);
  }
});
