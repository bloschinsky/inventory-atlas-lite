import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { freePort, startMcp } from './helpers.js';

/*
  The adapter process on its own, without a running Atlas: an unreachable Atlas only delays
  readiness, so these checks reach the listener and its failure modes.
*/
const TOKEN = `ial_${'0'.repeat(16)}_${'A'.repeat(43)}`;

test('a port that is already taken stops the adapter with a clear log line and exit code 4', async () => {
  const atlasPort = await freePort();
  const holder = net.createServer();
  await new Promise(resolve => holder.listen(0, '127.0.0.1', resolve));
  const { port } = holder.address();
  try {
    const mcp = startMcp({ ATLAS_BASE_URL: `http://127.0.0.1:${atlasPort}`, ATLAS_API_TOKEN: TOKEN, MCP_PORT: String(port) });
    await assert.rejects(mcp.ready, error => error.code === 4);
    const log = mcp.logs.join('\n');
    assert.ok(!/TypeError|\n\s+at /.test(log), `no stack trace in the log:\n${log}`);
    assert.ok(!log.includes('listening on'), 'the adapter never claims to listen');
    assert.ok(!log.includes('A'.repeat(43)), 'the token stays out of the log');
    const failure = mcp.logs.map(line => { try { return JSON.parse(line); } catch { return null; } })
      .find(entry => entry?.msg === 'cannot listen');
    assert.deepEqual({ level: failure?.level, code: failure?.code, host: failure?.host, port: failure?.port },
      { level: 'error', code: 'EADDRINUSE', host: '127.0.0.1', port });
  } finally {
    await new Promise(resolve => holder.close(resolve));
  }
});

test('a free port is announced only once it is bound', async () => {
  const atlasPort = await freePort();
  const mcp = startMcp({ ATLAS_BASE_URL: `http://127.0.0.1:${atlasPort}`, ATLAS_API_TOKEN: TOKEN });
  try {
    const endpoint = await mcp.ready;
    assert.equal((await fetch(`${endpoint}/healthz`)).status, 200);
  } finally {
    await mcp.stop();
  }
});
