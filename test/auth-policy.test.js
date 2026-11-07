import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_RULE, ROUTE_POLICY, matchRoute } from '../server/src/auth/routePolicy.js';
import { PERMISSIONS, ROLE_PERMISSIONS, TOKEN_SCOPES, permissionsOfScopes } from '../shared/permissions.js';

const root = path.resolve(import.meta.dirname, '..');
const routesDir = path.join(root, 'server/src/routes');

// Every route the route tables register, read from their source as `router.<verb>('<path>'`.
const registeredRoutes = () => fs.readdirSync(routesDir).filter(file => file.endsWith('.js')).flatMap(file =>
  [...fs.readFileSync(path.join(routesDir, file), 'utf8').matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)]
    .map(([, method, route]) => `${method.toUpperCase()} ${route}`));

test('every registered route has exactly one authorization entry, and every entry names a real route', () => {
  const registered = registeredRoutes();
  const policy = ROUTE_POLICY.map(rule => `${rule.method} ${rule.path}`);
  assert.ok(registered.length > 100, 'the route tables were found');
  assert.equal(new Set(policy).size, policy.length, 'no route has two entries');
  assert.deepEqual(registered.filter(route => !policy.includes(route)), [], 'routes without an entry');
  assert.deepEqual(policy.filter(route => !registered.includes(route)), [], 'entries without a route');
});

test('only the documented allowlist is public, and nothing is decided by the HTTP verb', () => {
  const publicRoutes = ROUTE_POLICY.filter(rule => rule.access === 'public').map(rule => `${rule.method} ${rule.path}`);
  assert.deepEqual(publicRoutes.sort(), ['GET /api/auth/session', 'GET /api/health', 'POST /api/auth/login', 'POST /api/auth/recover', 'POST /api/auth/setup']);
  const access = new Set([...Object.values(PERMISSIONS), 'public', 'session', 'token']);
  for (const rule of ROUTE_POLICY) assert.ok(access.has(rule.access), `${rule.method} ${rule.path} has a known access level`);
  // A GET can be sensitive and a POST can be read-only.
  assert.equal(matchRoute('GET', '/api/backup').access, PERMISSIONS.maintenanceManage);
  assert.equal(matchRoute('GET', '/api/settings/ai').access, PERMISSIONS.settingsManage);
  assert.equal(matchRoute('POST', '/api/items/labels').access, PERMISSIONS.inventoryRead);
  assert.equal(matchRoute('POST', '/api/items/bulk-replace/preview').access, PERMISSIONS.itemsWrite);
  assert.equal(matchRoute('POST', '/api/items/import-url/preview').access, PERMISSIONS.toolsUse);
});

test('matching follows Express: no case, no trailing slash, literals before parameters, and unknown paths need security:manage', () => {
  assert.equal(matchRoute('GET', '/API/Items/').path, '/api/items');
  assert.equal(matchRoute('HEAD', '/api/items').path, '/api/items');
  assert.equal(matchRoute('GET', '/api/items/columns').path, '/api/items/columns');
  assert.equal(matchRoute('GET', '/api/items/42').path, '/api/items/:id');
  assert.equal(matchRoute('GET', '/api/a-route-added-later'), DEFAULT_RULE);
  assert.equal(matchRoute('POST', '/api/items/42/unknown'), DEFAULT_RULE);
  assert.equal(matchRoute('GET', '/api//items'), DEFAULT_RULE);
  assert.equal(DEFAULT_RULE.access, PERMISSIONS.securityManage);
});

test('a viewer only reads, and no token scope reaches settings, maintenance, security, or server tools', () => {
  assert.deepEqual(ROLE_PERMISSIONS.viewer, [PERMISSIONS.inventoryRead]);
  assert.deepEqual(ROLE_PERMISSIONS.admin.slice().sort(), Object.values(PERMISSIONS).sort());
  const reachable = permissionsOfScopes(Object.keys(TOKEN_SCOPES));
  assert.deepEqual(reachable.sort(), [PERMISSIONS.inventoryRead, PERMISSIONS.itemsWrite].sort());
  // Destructive maintenance and administration need a fresh password confirmation.
  for (const route of ['POST /api/restore/apply', 'POST /api/database/reset/apply', 'POST /api/update/apply', 'POST /api/security/users', 'POST /api/security/tokens']) {
    const [method, url] = route.split(' ');
    assert.equal(matchRoute(method, url).fresh, true, route);
  }
});
