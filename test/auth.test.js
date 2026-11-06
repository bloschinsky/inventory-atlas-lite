import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ROUTE_POLICY } from '../server/src/auth/routePolicy.js';
import { createSecurity } from '../server/src/auth/security.js';
import { TEST_ADMIN, provisionUser, signIn, startServer, stopServer } from './serverProcess.js';

const json = (method, body, headers = {}) => ({ method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
// The secret part of an API token: everything after 'ial_<16 hex>_' (base64url, which may contain '_').
const secretOf = token => token.slice('ial_'.length + 17);
const tempDir = prefix => mkdtemp(path.join(os.tmpdir(), `inventory-auth-${prefix}-`));
const cli = (dataDir, ...args) => execFileSync(process.execPath, ['server/src/cli/auth.js', ...args], { env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8' });
const codeOf = output => output.match(/code(?: for [^:]+)?: ([A-Z0-9-]+)/)[1];
const errorCode = async response => (await response.json()).error?.code;
const cookieOf = response => response.headers.getSetCookie().find(cookie => /ial_session=./.test(cookie));
const sample = rule => rule.path.replace(/:[a-zA-Z]+/g, '1');
const VIEWER = { username: 'viewer-one', password: 'viewer-password-1' };

async function withServer(dataDir, options, work) {
  const server = await startServer(dataDir, options);
  try { return await work(server); } finally { await stopServer(server.child); }
}

test('a fresh installation stays locked until a setup code from the command line creates the first administrator', async () => {
  const dataDir = await tempDir('setup');
  try {
    await withServer(dataDir, { auth: false }, async ({ base }) => {
      assert.deepEqual(await (await fetch(`${base}/api/auth/session`)).json(), { authenticated: false, setupRequired: true });
      assert.equal((await fetch(`${base}/api/health`)).status, 200);
      // Every protected route refuses, whatever the verb.
      for (const rule of ROUTE_POLICY.filter(entry => entry.access !== 'public')) {
        const response = await fetch(`${base}${sample(rule)}`, { method: rule.method, redirect: 'manual' });
        if (rule.redirect) assert.equal(response.status, 303, `${rule.method} ${rule.path}`);
        else {
          assert.equal(response.status, 401, `${rule.method} ${rule.path}`);
          assert.equal(await errorCode(response), 'AUTH_SETUP_REQUIRED');
        }
      }
      // Nobody can claim the installation without the code printed on the machine.
      const form = { username: 'owner', password: 'owner-password-1' };
      assert.equal((await fetch(`${base}/api/auth/setup`, json('POST', form))).status, 401);
      assert.equal((await fetch(`${base}/api/auth/setup`, json('POST', { ...form, code: 'AAAA-BBBB-CCCC-DDDD-EEEE' }))).status, 401);

      const first = codeOf(cli(dataDir, 'init'));
      const code = codeOf(cli(dataDir, 'init'));
      assert.notEqual(first, code);
      assert.equal((await fetch(`${base}/api/auth/setup`, json('POST', { ...form, code: first }))).status, 401, 'a replaced code no longer works');

      // Two simultaneous claims with the valid code: exactly one administrator is created.
      const results = await Promise.all([
        fetch(`${base}/api/auth/setup`, json('POST', { ...form, code })),
        fetch(`${base}/api/auth/setup`, json('POST', { username: 'intruder', password: 'intruder-password', code: code.toLowerCase() }))
      ]);
      assert.deepEqual(results.map(response => response.status).sort(), [200, 401]);
      assert.equal((await fetch(`${base}/api/auth/setup`, json('POST', { ...form, code }))).status, 401, 'the code works once');
      assert.match(cli(dataDir, 'users'), /\tadmin\tactive/);
      assert.throws(() => cli(dataDir, 'init'), 'init refuses once an administrator exists');

      // After setup an anonymous request is a plain 401, and so is a route added without a policy entry.
      const anonymous = await fetch(`${base}/api/items`);
      assert.equal(await errorCode(anonymous), 'AUTH_REQUIRED');
      for (const url of ['/api/a-route-added-later', '/API/ITEMS', '/api/items/', '/api/photos/1']) {
        assert.equal((await fetch(`${base}${url}`)).status, 401, url);
      }
      assert.equal((await fetch(`${base}/api/items`, { method: 'HEAD' })).status, 401);
    });
    // The store is a separate file the inventory never contains, readable by its owner only.
    assert.ok(fs.existsSync(path.join(dataDir, 'auth.sqlite')));
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dataDir, 'auth.sqlite')).mode & 0o777, 0o600);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('signing in: one answer for every refusal, throttling, cookie flags, CSRF, cross-site requests, and session fixation', async () => {
  const dataDir = await tempDir('login');
  try {
    await withServer(dataDir, {}, async ({ base, fetch: admin }) => {
      const wrong = await fetch(`${base}/api/auth/login`, json('POST', { username: TEST_ADMIN.username, password: 'nope-nope-nope' }));
      const unknown = await fetch(`${base}/api/auth/login`, json('POST', { username: 'nobody-here', password: 'nope-nope-nope' }));
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.equal(await errorCode(wrong), 'AUTH_INVALID_CREDENTIALS');
      assert.equal(await errorCode(unknown), 'AUTH_INVALID_CREDENTIALS');

      // Signing in only accepts JSON from the application's own origin.
      assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
      const foreign = await fetch(`${base}/api/auth/login`, json('POST', TEST_ADMIN, { Origin: 'https://evil.example' }));
      assert.equal(await errorCode(foreign), 'AUTH_CROSS_SITE_REQUEST');

      const response = await fetch(`${base}/api/auth/login`, json('POST', TEST_ADMIN));
      assert.equal(response.status, 200);
      const cookie = cookieOf(response);
      assert.match(cookie, /^ial_session=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.doesNotMatch(cookie, /Secure/i, 'plain HTTP from this machine gets no Secure flag');
      const body = await response.json();
      assert.equal(body.user.role, 'admin');
      assert.ok(body.csrfToken);
      assert.equal(JSON.stringify(body).includes(TEST_ADMIN.password), false);
      const session = cookie.split(';')[0];

      // Cookie requests that change anything need the anti-CSRF header, and never come cross-site.
      const create = headers => fetch(`${base}/api/categories`, json('POST', { name: `C${Math.random()}` }, { Cookie: session, ...headers }));
      assert.equal(await errorCode(await create({})), 'AUTH_CSRF_INVALID');
      assert.equal(await errorCode(await create({ 'X-CSRF-Token': 'forged' })), 'AUTH_CSRF_INVALID');
      assert.equal(await errorCode(await create({ 'X-CSRF-Token': body.csrfToken, 'Sec-Fetch-Site': 'cross-site' })), 'AUTH_CROSS_SITE_REQUEST');
      assert.equal(await errorCode(await create({ 'X-CSRF-Token': body.csrfToken, Origin: 'https://evil.example' })), 'AUTH_CROSS_SITE_REQUEST');
      assert.equal((await create({ 'X-CSRF-Token': body.csrfToken, 'Sec-Fetch-Site': 'same-origin' })).status, 201);

      // A session identifier from before the login is never adopted: signing in replaces it.
      const again = await fetch(`${base}/api/auth/login`, json('POST', TEST_ADMIN, { Cookie: session, 'X-CSRF-Token': body.csrfToken }));
      const renewed = cookieOf(again).split(';')[0];
      assert.notEqual(renewed, session);
      assert.equal((await fetch(`${base}/api/items`, { headers: { Cookie: session } })).status, 401);
      assert.equal((await fetch(`${base}/api/items`, { headers: { Cookie: renewed } })).status, 200);

      // Repeated failures are slowed down per address and name; the right password then waits too.
      for (let attempt = 0; attempt < 5; attempt++) {
        await fetch(`${base}/api/auth/login`, json('POST', { username: 'throttled', password: `wrong-${attempt}-password` }));
      }
      const limited = await fetch(`${base}/api/auth/login`, json('POST', { username: 'throttled', password: 'whatever-password' }));
      assert.equal(limited.status, 429);
      const limit = await limited.json();
      assert.equal(limit.error.code, 'AUTH_TOO_MANY_ATTEMPTS');
      assert.ok(limit.error.params.retryAfterSeconds > 0);
      // Another account from the same address is not locked out by it.
      assert.equal((await fetch(`${base}/api/auth/login`, json('POST', TEST_ADMIN))).status, 200);

      // Logging out ends the session on the server.
      assert.equal((await admin(`${base}/api/auth/logout`, { method: 'POST' })).status, 204);
      assert.equal((await admin(`${base}/api/items`)).status, 401);
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('HTTPS is required for remote credentials, and forwarded headers count only from a trusted proxy', async () => {
  const dataDir = await tempDir('transport');
  try {
    const login = (base, headers) => fetch(`${base}/api/auth/login`, json('POST', TEST_ADMIN, headers));
    // No trusted proxy: forwarded headers are ignored, so they can neither fake HTTPS nor another address.
    await withServer(dataDir, {}, async ({ base }) => {
      const spoofed = await login(base, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.9' });
      assert.equal(spoofed.status, 200);
      assert.doesNotMatch(cookieOf(spoofed), /Secure/i);
    });
    await withServer(dataDir, { environment: { ATLAS_TRUST_PROXY: 'loopback' } }, async ({ base }) => {
      // Behind the trusted proxy: a remote client over plain HTTP is refused, over HTTPS it gets a __Host- Secure cookie.
      const plain = await login(base, { 'X-Forwarded-For': '203.0.113.9' });
      assert.equal(plain.status, 403);
      assert.equal(await errorCode(plain), 'AUTH_HTTPS_REQUIRED');
      const secure = await login(base, { 'X-Forwarded-For': '203.0.113.9', 'X-Forwarded-Proto': 'https' });
      assert.equal(secure.status, 200);
      const cookie = cookieOf(secure);
      assert.match(cookie, /^__Host-ial_session=/);
      assert.match(cookie, /Secure/i);
      assert.match(secure.headers.get('strict-transport-security'), /max-age=/);
      // The HTTPS cookie is not accepted on a plain HTTP request.
      assert.equal((await fetch(`${base}/api/items`, { headers: { Cookie: cookie.split(';')[0] } })).status, 401);
    });
    await withServer(dataDir, { environment: { ATLAS_TRUST_PROXY: 'loopback', ATLAS_ALLOW_HTTP: 'true' } }, async ({ base }) => {
      assert.equal((await login(base, { 'X-Forwarded-For': '203.0.113.9' })).status, 200, 'the explicit HTTP opt-in');
    });
    // A trust setting that would believe anyone stops the server instead.
    await assert.rejects(startServer(dataDir, { environment: { ATLAS_TRUST_PROXY: 'true' } }));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('a viewer browses the inventory and is refused every change, export, setting, tool, and administration', async () => {
  const dataDir = await tempDir('viewer');
  try {
    await withServer(dataDir, {}, async ({ base, fetch: admin }) => {
      const category = await (await admin(`${base}/api/categories`, json('POST', { name: 'Tools' }))).json();
      const item = await (await admin(`${base}/api/items`, json('POST', { name: 'Drill', category_id: category.id }))).json();
      const form = new FormData();
      form.append('photos', new Blob([fs.readFileSync('test/fixtures/sound-blaster-audigy-ls-on-bubble-wrap.jpg')], { type: 'image/jpeg' }), 'a.jpg');
      const [photo] = await (await admin(`${base}/api/items/${item.id}/photos`, { method: 'POST', body: form })).json();
      const created = await admin(`${base}/api/security/users`, json('POST', { ...VIEWER, role: 'viewer' }));
      assert.equal(created.status, 201);
      const viewerUser = await created.json();
      assert.equal(JSON.stringify(viewerUser).includes(VIEWER.password), false);
      const viewer = await signIn(base, VIEWER);

      for (const url of ['/api/items', `/api/items/${item.id}`, `/api/items/${item.id}/history`, '/api/items/hierarchy', '/api/categories',
        `/api/categories/${category.id}/fields`, '/api/dashboard', '/api/checklists', '/api/item-templates', '/api/capabilities', '/api/database/metadata',
        `/api/photos/${photo.id}`, '/api/auth/sessions']) {
        assert.equal((await viewer(`${base}${url}`)).status, 200, `GET ${url}`);
      }
      assert.equal((await viewer(`${base}/api/items/labels`, json('POST', { uuids: [item.uuid] }))).status, 200, 'label data is a read');

      const refused = [
        ['POST', '/api/items', { name: 'X', category_id: category.id }],
        ['PUT', `/api/items/${item.id}`, { name: 'Y', category_id: category.id }],
        ['DELETE', `/api/items/${item.id}`],
        ['PATCH', `/api/items/${item.id}/lifecycle`, { status: 'retired' }],
        ['POST', `/api/items/${item.id}/transfers`, { recipient: 'Bob' }],
        ['POST', '/api/items/bulk-replace/preview', {}],
        ['POST', '/api/items/bulk-parent/preview', {}],
        ['POST', '/api/items/batch', {}],
        ['POST', '/api/categories', { name: 'Z' }],
        ['POST', '/api/checklists', { name: 'Z' }],
        ['POST', `/api/items/${item.id}/audits`, {}],
        ['POST', '/api/items/import-url/preview', { url: 'https://example.com' }],
        ['POST', '/api/ai/translate', {}],
        ['POST', '/api/images/remove-background', {}],
        ['GET', '/api/backup'],
        ['GET', '/api/restore/status'],
        ['POST', '/api/restore/validate', {}],
        ['POST', '/api/database/reset/prepare', {}],
        ['GET', '/api/update/check'],
        ['POST', '/api/update/apply', {}],
        ['GET', '/api/settings/ai'],
        ['PUT', '/api/settings/ai', {}],
        ['GET', '/api/cloud-backup'],
        ['PUT', '/api/database/metadata', { name: 'Mine' }],
        ['GET', '/api/security/users'],
        ['GET', '/api/security/tokens'],
        // Escalating one's own role with a crafted request.
        ['PATCH', `/api/security/users/${viewerUser.id}`, { role: 'admin' }],
        ['GET', '/api/a-route-added-later']
      ];
      for (const [method, url, body] of refused) {
        const response = await viewer(`${base}${url}`, body === undefined ? { method } : json(method, body));
        assert.equal(response.status, 403, `${method} ${url}`);
        assert.equal(await errorCode(response), 'AUTH_FORBIDDEN');
      }
      // The OAuth return never completes anything for a viewer.
      const callback = await viewer(`${base}/api/cloud-backup/oauth/callback?state=x&code=y`, { redirect: 'manual' });
      assert.equal(callback.status, 303);
      assert.equal(callback.headers.get('location'), '/settings/cloud-backup?cloud=error');
      assert.equal((await (await admin(`${base}/api/security/users`)).json()).find(user => user.id === viewerUser.id).role, 'viewer');
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('API tokens: scoped, shown once, stored hashed, revocable, expiring, and never stronger than their owner', async () => {
  const dataDir = await tempDir('tokens');
  try {
    await withServer(dataDir, {}, async ({ base, fetch: admin }) => {
      const category = await (await admin(`${base}/api/categories`, json('POST', { name: 'Tokens' }))).json();
      const make = async body => {
        const response = await admin(`${base}/api/security/tokens`, json('POST', body));
        assert.equal(response.status, 201);
        return response.json();
      };
      const read = await make({ name: 'Reader', scopes: ['inventory:read'], expiresInDays: 30 });
      const write = await make({ name: 'Writer', scopes: ['items:write'], expiresInDays: null });
      assert.match(read.token, /^ial_[0-9a-f]{16}_/);
      assert.deepEqual(write.apiToken.scopes, ['inventory:read', 'items:write']);
      // Unknown scopes and administrative ones do not exist.
      assert.equal((await admin(`${base}/api/security/tokens`, json('POST', { name: 'Root', scopes: ['security:manage'] }))).status, 400);

      const listed = await (await admin(`${base}/api/security/tokens`)).text();
      assert.equal(listed.includes(read.token), false, 'the full token is never shown again');
      assert.equal(listed.includes(secretOf(read.token)), false);

      const bearer = (token, url, options = {}) => fetch(`${base}${url}`, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
      assert.equal((await bearer(read.token, '/api/items')).status, 200);
      assert.equal((await bearer(read.token, '/api/items', json('POST', { name: 'No', category_id: category.id }))).status, 403);
      const made = await bearer(write.token, '/api/items', json('POST', { name: 'Robot item', category_id: category.id }));
      assert.equal(made.status, 201, 'a write token needs no CSRF header');
      const item = await made.json();
      assert.equal((await bearer(write.token, `/api/items/${item.id}`, json('PUT', { name: 'Robot item 2', category_id: category.id }))).status, 200);
      for (const [method, url] of [['POST', '/api/categories'], ['GET', '/api/backup'], ['GET', '/api/settings/ai'], ['GET', '/api/security/users'],
        ['POST', '/api/security/tokens'], ['POST', '/api/database/reset/prepare'], ['POST', '/api/update/apply'], ['GET', '/api/auth/sessions'],
        ['POST', '/api/items/import-url/preview'], ['GET', '/api/cloud-backup']]) {
        assert.equal((await bearer(write.token, url, method === 'GET' ? {} : json(method, {}))).status, 403, `${method} ${url}`);
      }
      // A session cookie and a token together are refused rather than guessed between.
      const both = await fetch(`${base}/api/items`, { headers: { Authorization: `Bearer ${read.token}`, Cookie: admin.session.cookie } });
      assert.equal(both.status, 400);
      assert.equal(await errorCode(both), 'AUTH_AMBIGUOUS_CREDENTIALS');
      assert.equal((await bearer(`${read.token}x`, '/api/items')).status, 401);
      assert.equal((await bearer('not-a-token', '/api/items')).status, 401);

      // Revoked and expired tokens stop working at once.
      assert.equal((await admin(`${base}/api/security/tokens/${read.apiToken.id}`, { method: 'DELETE' })).status, 200);
      assert.equal((await bearer(read.token, '/api/items')).status, 401);
      const expiring = await make({ name: 'Short', scopes: ['inventory:read'], expiresInDays: 30 });
      const store = new Database(path.join(dataDir, 'auth.sqlite'));
      store.prepare('UPDATE api_tokens SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, expiring.apiToken.id);
      store.close();
      assert.equal((await bearer(expiring.token, '/api/items')).status, 401);
      const statuses = Object.fromEntries((await (await admin(`${base}/api/security/tokens`)).json()).map(token => [token.name, token.status]));
      assert.deepEqual(statuses, { Reader: 'revoked', Writer: 'active', Short: 'expired' });

      // A token acts for its creator: when that account is disabled, the token no longer works.
      await provisionUser(dataDir, { username: 'second-admin', password: 'second-admin-password', role: 'admin' });
      const second = await signIn(base, { username: 'second-admin', password: 'second-admin-password' });
      const owned = await (await second(`${base}/api/security/tokens`, json('POST', { name: 'Owned', scopes: ['items:write'] }))).json();
      assert.equal((await bearer(owned.token, '/api/items')).status, 200);
      const users = await (await admin(`${base}/api/security/users`)).json();
      const secondUser = users.find(user => user.username === 'second-admin');
      assert.equal((await admin(`${base}/api/security/users/${secondUser.id}`, json('PATCH', { disabled: true }))).status, 200);
      assert.equal((await bearer(owned.token, '/api/items')).status, 401);
      assert.equal((await second(`${base}/api/items`)).status, 401, 'disabling ends the sessions too');

      // Nothing secret is stored readable: no password, no token, no session secret in the store's text.
      const dump = new Database(path.join(dataDir, 'auth.sqlite'), { readonly: true });
      const text = ['users', 'sessions', 'api_tokens', 'audit_events'].flatMap(table => dump.prepare(`SELECT * FROM ${table}`).all())
        .map(row => JSON.stringify(row)).join('\n');
      dump.close();
      for (const secret of [TEST_ADMIN.password, 'second-admin-password', write.token, secretOf(write.token), admin.session.cookie.split('=')[1].split('.')[1]]) {
        assert.equal(text.includes(secret), false);
      }
      assert.match(text, /\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('administration guards: fresh reauthentication, self-lockout, the last administrator, and password changes', async () => {
  const dataDir = await tempDir('admin');
  try {
    await withServer(dataDir, { environment: { AUTH_REAUTH_WINDOW_MS: '800' } }, async ({ base, fetch: admin }) => {
      await new Promise(resolve => setTimeout(resolve, 900));
      const create = () => admin(`${base}/api/security/users`, json('POST', { ...VIEWER, role: 'viewer' }));
      const stale = await create();
      assert.equal(stale.status, 403);
      assert.equal(await errorCode(stale), 'AUTH_REAUTH_REQUIRED');
      assert.equal((await admin(`${base}/api/auth/reauthenticate`, json('POST', { password: 'wrong-password-x' }))).status, 403);
      assert.equal((await admin(`${base}/api/auth/reauthenticate`, json('POST', { password: TEST_ADMIN.password }))).status, 200);
      const viewerUser = await (await create()).json();
      assert.equal((await admin(`${base}/api/auth/reauthenticate`, json('POST', { password: TEST_ADMIN.password }))).status, 200);
      assert.equal(await errorCode(await create()), 'AUTH_USERNAME_TAKEN');
      assert.equal(await errorCode(await admin(`${base}/api/security/users`, json('POST', { username: 'short', password: 'short' }))), 'AUTH_INVALID_PASSWORD');

      const users = await (await admin(`${base}/api/security/users`)).json();
      const self = users.find(user => user.username === TEST_ADMIN.username);
      await admin(`${base}/api/auth/reauthenticate`, json('POST', { password: TEST_ADMIN.password }));
      assert.equal(await errorCode(await admin(`${base}/api/security/users/${self.id}`, json('PATCH', { disabled: true }))), 'AUTH_SELF_LOCKOUT');
      assert.equal(await errorCode(await admin(`${base}/api/security/users/${self.id}`, json('PATCH', { role: 'viewer' }))), 'AUTH_SELF_LOCKOUT');
      assert.equal(await errorCode(await admin(`${base}/api/security/users/${self.id}/password`, json('POST', { password: 'another-long-password' }))), 'AUTH_SELF_RESET');

      // A reset password and a role change end the account's sessions.
      const viewer = await signIn(base, VIEWER);
      assert.equal((await admin(`${base}/api/security/users/${viewerUser.id}/password`, json('POST', { password: 'reset-viewer-password' }))).status, 200);
      assert.equal((await viewer(`${base}/api/items`)).status, 401);
      await assert.rejects(signIn(base, VIEWER));
      const reset = await signIn(base, { username: VIEWER.username, password: 'reset-viewer-password' });

      // A person's own password change needs the current one and signs out their other sessions.
      const other = await signIn(base, { username: VIEWER.username, password: 'reset-viewer-password' });
      assert.equal((await reset(`${base}/api/auth/sessions`).then(response => response.json())).length, 2);
      assert.equal(await errorCode(await reset(`${base}/api/auth/password`, json('POST', { currentPassword: 'wrong', newPassword: 'changed-viewer-password' }))), 'AUTH_CURRENT_PASSWORD_INVALID');
      const before = reset.session.cookie;
      const changed = await reset(`${base}/api/auth/password`, json('POST', { currentPassword: 'reset-viewer-password', newPassword: 'changed-viewer-password' }));
      assert.equal(changed.status, 200);
      assert.notEqual(reset.session.cookie, before, 'the session is rotated');
      reset.session.csrfToken = (await changed.json()).csrfToken;
      assert.equal((await reset(`${base}/api/items`)).status, 200);
      assert.equal((await other(`${base}/api/items`)).status, 401);
      assert.equal((await fetch(`${base}/api/items`, { headers: { Cookie: before } })).status, 401);

      // Sessions: one's own list, revoking one other, and never someone else's.
      const third = await signIn(base, { username: VIEWER.username, password: 'changed-viewer-password' });
      const listed = await (await reset(`${base}/api/auth/sessions`)).json();
      assert.equal(listed.filter(session => session.current).length, 1);
      const foreignId = listed.find(session => !session.current).id;
      assert.equal((await admin(`${base}/api/auth/sessions/${foreignId}`, { method: 'DELETE' })).status, 404);
      assert.equal((await reset(`${base}/api/auth/sessions/revoke-others`, { method: 'POST' })).status, 200);
      assert.equal((await third(`${base}/api/items`)).status, 401);
    });

    // The last-administrator rule holds in the service itself, whoever calls it.
    const security = createSecurity(dataDir);
    try {
      const sole = security.userAdminService.list().find(user => user.role === 'admin');
      assert.throws(() => security.userAdminService.update({ type: 'session', userId: 999999 }, sole.id, { disabled: true }), { code: 'AUTH_LAST_ADMIN' });
      assert.throws(() => security.userAdminService.update({ type: 'session', userId: 999999 }, sole.id, { role: 'viewer' }), { code: 'AUTH_LAST_ADMIN' });
    } finally {
      security.close();
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('recovery from the command line, inventory backup isolation, restarts, separate instances, and a damaged store', async () => {
  const dataDir = await tempDir('recovery');
  const otherDir = await tempDir('other-instance');
  try {
    let token;
    await withServer(dataDir, { args: ['--production'] }, async ({ base, fetch: admin }) => {
      token = (await (await admin(`${base}/api/security/tokens`, json('POST', { name: 'Kept', scopes: ['inventory:read'] }))).json()).token;
      // The inventory backup carries no account, session, or token.
      const backup = Buffer.from(await (await admin(`${base}/api/backup`)).arrayBuffer());
      const text = backup.toString('latin1');
      for (const needle of ['argon2', 'api_tokens', 'password_hash', TEST_ADMIN.username, secretOf(token)]) assert.equal(text.includes(needle), false, needle);
      await admin(`${base}/api/security/users`, json('POST', { ...VIEWER, role: 'viewer' }));
      await admin(`${base}/api/security/tokens/${token.split('_')[1]}`, { method: 'DELETE' });
      token = (await (await admin(`${base}/api/security/tokens`, json('POST', { name: 'New', scopes: ['inventory:read'] }))).json()).token;

      // Restoring the older inventory backup changes no account, session, or token.
      const form = new FormData();
      form.append('backup', new Blob([backup]), 'backup.sqlite');
      const validated = await (await admin(`${base}/api/restore/validate`, { method: 'POST', body: form })).json();
      const restored = await admin(`${base}/api/restore/apply`, json('POST', { restore_token: validated.restore_token, confirmation: 'RESTORE' }));
      assert.equal(restored.status, 200);
      assert.equal((await admin(`${base}/api/items`)).status, 200, 'the session survives the restore');
      assert.equal((await fetch(`${base}/api/items`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
      assert.ok((await (await admin(`${base}/api/security/users`)).json()).some(user => user.username === VIEWER.username));
    });

    // A recovery code sets a new password, enables the account again, and ends its sessions.
    const security = createSecurity(dataDir);
    const viewerId = security.userAdminService.list().find(user => user.username === VIEWER.username).id;
    security.userAdminService.update({ type: 'session', userId: 0 }, viewerId, { disabled: true });
    security.close();
    const code = codeOf(cli(dataDir, 'recover', VIEWER.username));
    assert.throws(() => cli(dataDir, 'recover', 'nobody-here'));
    await withServer(dataDir, {}, async ({ base }) => {
      // Accounts and tokens survive a restart.
      assert.equal((await fetch(`${base}/api/items`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
      const recover = body => fetch(`${base}/api/auth/recover`, json('POST', body));
      assert.equal((await recover({ username: TEST_ADMIN.username, code, password: 'recovered-password-1' })).status, 401, 'the code belongs to one account');
      const recovered = await recover({ username: VIEWER.username, code, password: 'recovered-password-1' });
      assert.equal(recovered.status, 200);
      assert.equal((await recovered.json()).user.role, 'viewer', 'recovery never changes the role');
      assert.equal((await recover({ username: VIEWER.username, code, password: 'recovered-password-2' })).status, 401, 'the code works once');
      const viewer = await signIn(base, { username: VIEWER.username, password: 'recovered-password-1' });

      // A second instance has its own store: this session means nothing there.
      await withServer(otherDir, {}, async ({ base: otherBase }) => {
        assert.equal((await fetch(`${otherBase}/api/items`, { headers: { Cookie: viewer.session.cookie } })).status, 401);
        assert.equal((await fetch(`${otherBase}/api/items`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
      });

      // A recovery for a suspected leak can also revoke every API token of the account at once.
      assert.match(cli(dataDir, 'recover', TEST_ADMIN.username), /API tokens keep working/);
      assert.equal((await fetch(`${base}/api/items`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
      assert.match(cli(dataDir, 'recover', TEST_ADMIN.username, '--revoke-tokens'), /All 1 active API tokens of this account were revoked/);
      assert.equal((await fetch(`${base}/api/items`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    });

    // A damaged security store stops the server instead of starting it without accounts.
    fs.writeFileSync(path.join(dataDir, 'auth.sqlite'), 'this is not a database');
    for (const sidecar of ['auth.sqlite-wal', 'auth.sqlite-shm']) fs.rmSync(path.join(dataDir, sidecar), { force: true });
    await assert.rejects(startServer(dataDir, { auth: false }));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(otherDir, { recursive: true, force: true });
  }
});
