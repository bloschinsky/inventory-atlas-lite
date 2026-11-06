import { spawn } from 'node:child_process';
import { createSecurity } from '../server/src/auth/security.js';

// The administrator every API test server starts with, created in the security store of its DATA_DIR.
export const TEST_ADMIN = Object.freeze({ username: 'test-admin', password: 'test-admin-password' });

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const sessionCookieOf = response => response.headers.getSetCookie().map(cookie => cookie.split(';')[0])
  .find(cookie => /^(__Host-)?ial_session=./.test(cookie));

// Creates an account directly in the security store, as the command line would; existing names are kept.
export async function provisionUser(dataDir, { username, password, role = 'admin' }) {
  const security = createSecurity(dataDir);
  try {
    const users = security.userAdminService.users;
    if (!users.findByUsername(username)) {
      users.create({ username, role, passwordHash: await security.userAdminService.hasher.hash(password), now: Date.now() });
    }
  } finally {
    security.close();
  }
}

/*
  A fetch for one signed-in browser: requests to the server carry its session cookie and, when they
  change anything, its anti-CSRF header, the way the application's own pages send them. A rotated
  session cookie is followed. Requests elsewhere (provider stubs) pass through unchanged.
*/
export function sessionFetch(base, session) {
  const state = { ...session };
  const client = async (url, options = {}) => {
    if (!String(url).startsWith(base)) return fetch(url, options);
    const headers = new Headers(options.headers);
    headers.set('cookie', [headers.get('cookie'), state.cookie].filter(Boolean).join('; '));
    if (UNSAFE.has((options.method ?? 'GET').toUpperCase()) && !headers.has('x-csrf-token')) headers.set('x-csrf-token', state.csrfToken);
    const response = await fetch(url, { ...options, headers });
    const rotated = sessionCookieOf(response);
    if (rotated) state.cookie = rotated;
    return response;
  };
  client.session = state;
  return client;
}

export async function signIn(base, { username, password }) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
  });
  if (!response.ok) throw new Error(`Sign-in as ${username} failed with ${response.status}.`);
  const { csrfToken } = await response.json();
  return sessionFetch(base, { cookie: sessionCookieOf(response), csrfToken });
}

/*
  Starts the real server in a child process for the API tests. It listens on port 0, so the operating
  system picks a free port: a fixed test port can be taken by any socket of the test files running in
  parallel, which made the server exit on start. The port is read from the listening line, and the
  server's errors stay visible in the test output.

  Unless `auth: false`, the data directory gets the test administrator first, and the answer's
  `fetch` is already signed in as that administrator.
*/
export async function startServer(dataDir, { environment = {}, args = [], auth = true } = {}) {
  if (auth) await provisionUser(dataDir, { ...TEST_ADMIN, role: 'admin' });
  const child = spawn(process.execPath, ['server/src/index.js', ...args], {
    cwd: process.cwd(), env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ...environment }, stdio: ['ignore', 'pipe', 'inherit']
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server did not become ready.')); }, 10000);
    const onExit = code => { clearTimeout(timer); reject(new Error(`Server exited before becoming ready (exit code ${code}).`)); };
    child.once('exit', onExit);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (output === null) return;
      output += chunk;
      const port = output.match(/listening on http:\/\/[^:]+:(\d+)/)?.[1];
      if (!port) return;
      // Later output is only drained, so a full pipe can never block the server.
      output = null;
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(`http://127.0.0.1:${port}`);
    });
  });
  try {
    return { child, base, fetch: auth ? await signIn(base, TEST_ADMIN) : fetch };
  } catch (error) {
    child.kill();
    throw error;
  }
}

export async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}
