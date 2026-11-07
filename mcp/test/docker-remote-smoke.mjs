import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  Full-path smoke test of remote MCP access with the shipped mcp/deploy/compose.remote.yaml:

    node mcp/test/docker-remote-smoke.mjs <atlas-image>

  A real Atlas container plays "your existing Atlas" on the stack's atlas-upstream network. The
  stack runs unchanged except for a test override: Caddy uses its internal CA for the illustrative
  host mcp.example.test instead of a public certificate and publishes no host port, and the token
  secret comes from a temporary file. A client container on the public side completes OAuth with an
  enrollment code from `cli.js enroll` and reads through Caddy over HTTPS. Then: Atlas and the
  adapter are unreachable from the public side, Caddy answers 404 for Atlas paths, the adapter has no
  host port, no Atlas data volume, no Docker socket, a read-only root, no token in its environment
  or log, and its OAuth grant survives a restart.
*/
const atlasImage = process.argv[2];
if (!atlasImage) throw new Error('Usage: node mcp/test/docker-remote-smoke.mjs <atlas-image>');

const deployDir = fileURLToPath(new URL('../deploy/', import.meta.url));
const project = `atlas-mcp-remote-smoke-${process.pid}`;
const atlasName = `${project}-atlas`;
const domain = 'mcp.example.test';
const work = mkdtempSync(path.join(os.tmpdir(), 'atlas-mcp-remote-smoke-'));
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...options }).trim();
const quiet = args => { try { docker(args, { stdio: ['ignore', 'ignore', 'ignore'] }); } catch { /* already gone */ } };
const env = { ...process.env, MCP_DOMAIN: domain, ATLAS_BASE_URL: 'http://atlas:3000' };
const override = path.join(work, 'compose.smoke.yaml');
const compose = (args, options = {}) => docker(['compose', '--project-name', project, '--file', path.join(deployDir, 'compose.remote.yaml'), '--file', override, ...args], { env, ...options });
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function waitFor(check, message) {
  const deadline = Date.now() + 120000;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}.`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

const cleanup = () => {
  quiet(['compose', '--project-name', project, '--file', path.join(deployDir, 'compose.remote.yaml'), '--file', override, 'down', '--volumes', '--remove-orphans']);
  quiet(['rm', '--force', atlasName]);
  rmSync(work, { recursive: true, force: true });
};

try {
  // "Your existing Atlas": its first administrator, a synthetic item, and a Read-only token.
  docker(['run', '--detach', '--name', atlasName, '--publish', '127.0.0.1::3000', '--env', 'ATLAS_ALLOW_HTTP=true', atlasImage]);
  const atlasUrl = `http://127.0.0.1:${docker(['port', atlasName, '3000/tcp']).split('\n')[0].split(':').pop()}`;
  await waitFor(async () => (await fetch(`${atlasUrl}/api/health`)).ok, 'Atlas');
  const setupCode = docker(['exec', atlasName, 'node', 'server/src/cli/auth.js', 'init']).match(/^Setup code: (.+)$/m)?.[1];
  const setup = await fetch(`${atlasUrl}/api/auth/setup`, json('POST', { code: setupCode, username: 'smoke-admin', password: 'docker-remote-smoke-password' }));
  assert.equal(setup.status, 200);
  const session = { cookie: setup.headers.getSetCookie().map(cookie => cookie.split(';')[0]).find(cookie => /ial_session=./.test(cookie)), csrf: (await setup.json()).csrfToken };
  const admin = async (url, body) => {
    const response = await fetch(`${atlasUrl}${url}`, { ...json('POST', body), headers: { 'Content-Type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf } });
    assert.ok(response.ok, `${url} answered ${response.status}`);
    return response.json();
  };
  const category = await admin('/api/categories', { name: 'Docker remote smoke category' });
  await admin('/api/items', { name: 'Docker remote smoke item', category_id: category.id, location: 'Shelf' });
  const { token } = await admin('/api/security/tokens', { name: 'Docker remote smoke', scopes: ['inventory:read'] });

  // The test override: Caddy's internal CA, no host ports, the token from a temporary file.
  const tokenFile = path.join(work, 'atlas-mcp-token');
  writeFileSync(tokenFile, token, { mode: 0o644 });
  const caddyfile = path.join(work, 'Caddyfile');
  writeFileSync(caddyfile, readFileSync(path.join(deployDir, 'Caddyfile'), 'utf8').replace('{$MCP_DOMAIN} {', '{$MCP_DOMAIN} {\n\ttls internal'));
  writeFileSync(override, [
    'services:',
    '  caddy:',
    '    ports: !reset []',
    '    volumes:',
    `      - ${JSON.stringify(`${caddyfile}:/etc/caddy/Caddyfile:ro`)}`,
    '    networks:',
    `      default: { aliases: [${domain}] }`,
    '      mcp-edge: {}',
    'secrets:',
    '  atlas_mcp_token:',
    `    file: ${JSON.stringify(tokenFile)}`,
    ''
  ].join('\n'));

  compose(['up', '--no-start', '--build', '--quiet-pull']);
  docker(['network', 'connect', '--alias', 'atlas', `${project}_atlas-upstream`, atlasName]);
  compose(['up', '--detach']);
  const ready = () => compose(['exec', '-T', 'atlas-mcp', 'node', '-e', "fetch('http://127.0.0.1:3100/readyz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"], { stdio: ['ignore', 'ignore', 'ignore'] });
  await waitFor(async () => { ready(); return true; }, 'the adapter to be ready');

  const rootCa = path.join(work, 'root.crt');
  await waitFor(async () => {
    quiet(['compose', '--project-name', project, '--file', path.join(deployDir, 'compose.remote.yaml'), '--file', override, 'cp', 'caddy:/data/caddy/pki/authorities/local/root.crt', rootCa]);
    return existsSync(rootCa);
  }, 'Caddy\'s internal CA');

  const enrollmentCode = compose(['exec', '-T', 'atlas-mcp', 'node', '--disable-warning=ExperimentalWarning', 'src/cli.js', 'enroll']).match(/^Enrollment code: (\S+)$/m)[1];
  const clientScript = readFileSync(new URL('./docker-remote-smoke-client.mjs', import.meta.url), 'utf8');
  const read = (mode, secret) => JSON.parse(docker(['run', '--rm', '--interactive', '--network', `${project}_default`, '--volume', `${rootCa}:/ca.crt:ro`,
    '--env', 'NODE_EXTRA_CA_CERTS=/ca.crt', '--workdir', '/app', '--entrypoint', 'node', 'inventory-atlas-mcp:local',
    '--input-type=module', '-', `https://${domain}`, mode, secret], { input: clientScript }));

  const expected = {
    anonymous: 401,
    tools: ['get_inventory_summary', 'get_item', 'get_item_history', 'get_item_location', 'list_categories', 'search_items'],
    found: ['Docker remote smoke item'],
    edge: { atlasApi: 404, readyz: 404, atlasDirect: false, adapterDirect: false }
  };
  const first = read('enroll', enrollmentCode);
  assert.deepEqual({ ...first, token: undefined }, { ...expected, token: undefined }, 'OAuth over HTTPS through Caddy, and nothing else reachable');
  assert.match(first.token, /^amcp_at_/);

  // The grant is persistent: after a restart of the adapter the same access token still reads.
  compose(['restart', 'atlas-mcp']);
  await waitFor(async () => { ready(); return true; }, 'the adapter to be ready again');
  assert.deepEqual({ ...read('token', first.token), token: undefined }, { ...expected, token: undefined }, 'the grant survives a restart');

  const container = compose(['ps', '--quiet', 'atlas-mcp']);
  const inspected = JSON.parse(docker(['inspect', container]))[0];
  assert.deepEqual(Object.values(inspected.NetworkSettings.Ports ?? {}).filter(Boolean), [], 'the adapter publishes no host port');
  assert.deepEqual(Object.keys(inspected.NetworkSettings.Networks).sort(), [`${project}_atlas-upstream`, `${project}_mcp-edge`]);
  assert.equal(JSON.parse(docker(['network', 'inspect', `${project}_mcp-edge`]))[0].Internal, true);
  assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
  const mounts = inspected.Mounts.map(mount => mount.Destination).sort();
  assert.deepEqual(mounts.filter(target => !target.startsWith('/run/secrets/')), ['/var/lib/atlas-mcp'], 'only the OAuth state volume is mounted');
  assert.ok(!inspected.Mounts.some(mount => /docker\.sock|\/data$/.test(`${mount.Source} ${mount.Destination}`)), 'no Docker socket or Atlas data');
  assert.ok(!inspected.Config.Env.some(entry => entry.includes(token)), 'the Atlas token is not in the environment');
  const logs = execFileSync('docker', ['logs', container], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  for (const secret of [token, first.token, enrollmentCode, 'Docker remote smoke item']) assert.ok(!logs.includes(secret), 'the log holds no secret or inventory text');
  console.log('MCP remote (OAuth, HTTPS, Compose) smoke test passed.');
} finally {
  cleanup();
}
