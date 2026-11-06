import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const MCP_DIR = fileURLToPath(new URL('..', import.meta.url));
export const REPO_DIR = fileURLToPath(new URL('../..', import.meta.url));

export const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

/*
  Starts the adapter as its own process, the way an operator does, on a free port. Every log line is
  kept so tests can check what the adapter writes. `ready` resolves with the endpoint once it
  listens, or rejects with the exit code when it stops first (a rejected token, a bad setting).
*/
export function startMcp(environment) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: MCP_DIR, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, MCP_PORT: '0', ...environment }, stdio: ['ignore', 'ignore', 'pipe']
  });
  const logs = [];
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  const ready = new Promise((resolve, reject) => {
    let buffer = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        logs.push(line);
        const port = line.match(/listening on http:\/\/[^:]+:(\d+)\/mcp/)?.[1];
        if (port) resolve(`http://127.0.0.1:${port}`);
      }
    });
    exited.then(code => reject(Object.assign(new Error(`atlas-mcp exited with ${code}`), { code })));
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
  };
  return { child, logs, ready, exited, stop };
}

// Polls an observable condition (never a fixed sleep) until it holds or the time runs out.
export async function waitFor(check, { timeoutMs = 15000, intervalMs = 100, message = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${message}.`);
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
