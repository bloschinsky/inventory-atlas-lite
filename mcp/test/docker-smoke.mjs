import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  Docker smoke test of the optional MCP adapter beside a real Atlas container:

    node mcp/test/docker-smoke.mjs <atlas-image>

  Atlas runs on the default bridge with a loopback-only published port (for the setup from this
  machine) and on an internal network; the adapter runs only on the internal network with its token
  as a mounted secret file and no published port. A client container on the internal network reads
  through the adapter, Atlas is restarted, and the same reads must work again. The adapter must have
  no host port, no route outside the internal network, and no token in its log.
*/
const atlasImage = process.argv[2];
if (!atlasImage) throw new Error('Usage: node mcp/test/docker-smoke.mjs <atlas-image>');

const mcpDir = fileURLToPath(new URL('..', import.meta.url));
const suffix = `${process.pid}`;
const names = { network: `atlas-mcp-smoke-${suffix}`, atlas: `atlas-smoke-${suffix}`, mcp: `atlas-mcp-${suffix}`, image: `inventory-atlas-mcp:smoke-${suffix}` };
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...options }).trim();
const quiet = args => { try { docker(args, { stdio: ['ignore', 'ignore', 'ignore'] }); } catch { /* already gone */ } };
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function waitFor(check, message) {
  const deadline = Date.now() + 90000;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}.`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

let tokenDir = null;
const cleanup = () => {
  if (tokenDir) rmSync(tokenDir, { recursive: true, force: true });
  quiet(['rm', '--force', names.mcp, names.atlas]);
  quiet(['network', 'rm', names.network]);
  quiet(['image', 'rm', names.image]);
};

try {
  docker(['build', '--quiet', '--tag', names.image, mcpDir]);
  docker(['network', 'create', '--internal', names.network]);
  docker(['run', '--detach', '--name', names.atlas, '--publish', '127.0.0.1::3000', '--env', 'ATLAS_ALLOW_HTTP=true', atlasImage]);
  docker(['network', 'connect', '--alias', 'atlas', names.network, names.atlas]);
  const atlasUrl = `http://127.0.0.1:${docker(['port', names.atlas, '3000/tcp']).split('\n')[0].split(':').pop()}`;
  await waitFor(async () => (await fetch(`${atlasUrl}/api/health`)).ok, 'Atlas');

  // The first administrator, the documented way, then a synthetic item and a read-only token.
  const code = docker(['exec', names.atlas, 'node', 'server/src/cli/auth.js', 'init']).match(/^Setup code: (.+)$/m)?.[1];
  assert.ok(code, 'auth.js init printed a setup code');
  const setup = await fetch(`${atlasUrl}/api/auth/setup`, json('POST', { code, username: 'smoke-admin', password: 'docker-mcp-smoke-password' }));
  assert.equal(setup.status, 200);
  const session = { cookie: setup.headers.getSetCookie().map(cookie => cookie.split(';')[0]).find(cookie => /ial_session=./.test(cookie)), csrf: (await setup.json()).csrfToken };
  const admin = async (path, body) => {
    const response = await fetch(`${atlasUrl}${path}`, { ...json('POST', body), headers: { 'Content-Type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf } });
    assert.ok(response.ok, `${path} answered ${response.status}`);
    return response.json();
  };
  const category = await admin('/api/categories', { name: 'Docker MCP smoke category' });
  await admin('/api/items', { name: 'Docker MCP smoke item', category_id: category.id, location: 'Shelf' });
  const { token } = await admin('/api/security/tokens', { name: 'Docker MCP smoke', scopes: ['inventory:read'] });

  // The token goes in as a mounted file, like a Compose secret, never as an argument or environment value.
  tokenDir = mkdtempSync(path.join(os.tmpdir(), 'atlas-mcp-smoke-'));
  const tokenFile = path.join(tokenDir, 'atlas_mcp_token');
  writeFileSync(tokenFile, token, { mode: 0o644 });
  docker(['run', '--detach', '--name', names.mcp, '--network', names.network, '--env', 'ATLAS_BASE_URL=http://atlas:3000',
    '--env', 'ATLAS_API_TOKEN_FILE=/run/secrets/atlas_mcp_token', '--env', `MCP_ALLOWED_HOSTS=${names.mcp}`,
    '--volume', `${tokenFile}:/run/secrets/atlas_mcp_token:ro`, names.image]);

  const clientScript = readFileSync(new URL('./docker-smoke-client.mjs', import.meta.url), 'utf8');
  const read = () => JSON.parse(docker(['run', '--rm', '--interactive', '--network', names.network, '--workdir', '/app', '--entrypoint', 'node',
    names.image, '--input-type=module', '-', `http://${names.mcp}:3100`], { input: clientScript }));
  const expected = {
    tools: ['get_inventory_summary', 'get_item', 'get_item_history', 'get_item_location', 'list_categories', 'search_items'],
    found: ['Docker MCP smoke item'], activeItems: 1
  };
  assert.deepEqual(read(), expected, 'reads through the adapter on the private network');

  docker(['restart', names.atlas]);
  assert.deepEqual(read(), expected, 'the adapter recovers after Atlas restarts');

  const inspected = JSON.parse(docker(['inspect', names.mcp]))[0];
  assert.deepEqual(Object.values(inspected.NetworkSettings.Ports ?? {}).filter(Boolean), [], 'the adapter publishes no host port');
  assert.deepEqual(Object.keys(inspected.NetworkSettings.Networks), [names.network], 'the adapter is only on the internal network');
  assert.equal(JSON.parse(docker(['network', 'inspect', names.network]))[0].Internal, true);
  assert.ok(!inspected.Config.Env.some(entry => entry.includes(token)), 'the token is not in the environment');
  const logs = execFileSync('docker', ['logs', names.mcp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.ok(!logs.includes(token) && !logs.includes('Docker MCP smoke item'), 'the log holds neither the token nor inventory text');
  console.log('MCP adapter Docker smoke test passed.');
} finally {
  cleanup();
}
