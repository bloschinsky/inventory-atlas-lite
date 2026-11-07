import { PERMISSIONS as P } from '../../../shared/permissions.js';

/*
  The authorization matrix of the whole REST API: every route the server registers has exactly one
  entry, checked by test/auth-policy.test.js, and docs/features/authentication-and-access.md explains
  each decision. The HTTP verb never decides anything: a POST preview can be read-only, and a GET can
  export the whole database.

  access:
    'public'   - answered without credentials (the documented allowlist)
    'session'  - any signed-in person, never an API token (their own account and sessions)
    'token'    - any API token, never a browser session (the calling token's own description)
    permission - one of shared/permissions.js
  options:
    fresh      - the password must have been confirmed within the reauthentication window
    redirect   - a browser navigation, not a fetch: a refusal redirects there instead of answering JSON

  A path that matches no entry needs security:manage, which no API token and no viewer has: a route
  added without an entry is never public, and its tests fail until it gets one.
*/
const R = P.inventoryRead;
const W = P.itemsWrite;
const M = P.inventoryManage;
const T = P.toolsUse;
const S = P.settingsManage;
const X = P.maintenanceManage;
const A = P.securityManage;

export const ROUTE_POLICY = [
  // Probes and signing in.
  ['GET', '/api/health', 'public'],
  ['GET', '/api/auth/session', 'public'],
  ['POST', '/api/auth/login', 'public'],
  ['POST', '/api/auth/setup', 'public'],
  ['POST', '/api/auth/recover', 'public'],
  // The signed-in person's own account.
  ['POST', '/api/auth/logout', 'session'],
  ['POST', '/api/auth/reauthenticate', 'session'],
  ['POST', '/api/auth/password', 'session'],
  ['GET', '/api/auth/sessions', 'session'],
  ['POST', '/api/auth/sessions/revoke-others', 'session'],
  ['DELETE', '/api/auth/sessions/:id', 'session'],
  // The calling API token's own effective permissions, so a service can refuse an overprivileged token.
  ['GET', '/api/auth/token', 'token'],
  // Security & Access administration.
  ['GET', '/api/security/users', A],
  ['POST', '/api/security/users', A, { fresh: true }],
  ['PATCH', '/api/security/users/:id', A, { fresh: true }],
  ['POST', '/api/security/users/:id/password', A, { fresh: true }],
  ['GET', '/api/security/tokens', A],
  ['POST', '/api/security/tokens', A, { fresh: true }],
  ['DELETE', '/api/security/tokens/:id', A],

  // Interface state every signed-in principal needs; it carries no credentials.
  ['GET', '/api/capabilities', R],
  ['GET', '/api/database/metadata', R],
  ['PUT', '/api/database/metadata', S],
  ['PUT', '/api/database/metadata/content-language', S],

  // Items: reads.
  ['GET', '/api/items', R],
  ['GET', '/api/items/columns', R],
  ['GET', '/api/items/hierarchy', R],
  ['GET', '/api/items/parent-candidates', R],
  ['GET', '/api/items/transferred-to-suggestions', R],
  ['GET', '/api/items/bulk-replace/fields', R],
  ['GET', '/api/items/bulk-replace/values/:type/:id', R],
  ['GET', '/api/items/:id', R],
  ['GET', '/api/items/:id/history', R],
  ['GET', '/api/photos/:id', R],
  // Label sheets only read the chosen items; POST carries the selection.
  ['POST', '/api/items/labels', R],
  // Items: writes, including the previews of bulk writes, which exist only to prepare them.
  ['POST', '/api/items', W],
  ['POST', '/api/items/batch', W],
  ['PUT', '/api/items/:id', W],
  ['DELETE', '/api/items/:id', W],
  ['PATCH', '/api/items/:id/lifecycle', W],
  ['POST', '/api/items/:id/transfers', W],
  ['POST', '/api/items/:id/transfers/:transferId/return', W],
  ['POST', '/api/items/bulk-replace/preview', W],
  ['POST', '/api/items/bulk-replace', W],
  ['POST', '/api/items/bulk-parent/preview', W],
  ['PATCH', '/api/items/bulk-parent', W],
  ['POST', '/api/items/:id/photos', W],
  ['PUT', '/api/items/:id/photos/order', W],
  ['DELETE', '/api/photos/:id', W],

  // Categories and custom fields.
  ['GET', '/api/categories', R],
  ['POST', '/api/categories', M],
  ['PUT', '/api/categories/:id', M],
  ['DELETE', '/api/categories/:id', M],
  ['GET', '/api/categories/:id/fields', R],
  ['POST', '/api/categories/:id/fields', M],
  ['POST', '/api/categories/:id/fields/batch', M],
  ['GET', '/api/fields/:id/suggestions', R],
  ['PATCH', '/api/fields/:id', M],
  ['DELETE', '/api/fields/:id', M],

  // Templates.
  ['GET', '/api/item-templates', R],
  ['GET', '/api/item-templates/:id', R],
  ['GET', '/api/item-templates/:id/item-draft', R],
  ['POST', '/api/item-templates', M],
  ['PUT', '/api/item-templates/:id', M],
  ['DELETE', '/api/item-templates/:id', M],

  // Checklists, their runs, and container audits: reading them is browsing, running them changes data.
  ['GET', '/api/checklists', R],
  ['GET', '/api/checklists/:id', R],
  ['GET', '/api/checklists/:id/runs', R],
  ['GET', '/api/checklist-runs', R],
  ['GET', '/api/checklist-runs/:runId', R],
  ['GET', '/api/items/:id/audits', R],
  ['POST', '/api/checklists', M],
  ['PUT', '/api/checklists/:id', M],
  ['DELETE', '/api/checklists/:id', M],
  ['POST', '/api/checklists/:id/runs', M],
  ['PATCH', '/api/checklist-runs/:runId/items/:runItemId', M],
  ['PATCH', '/api/checklist-runs/:runId/inventory-items/:itemId', M],
  ['POST', '/api/checklist-runs/:runId/complete', M],
  ['POST', '/api/items/:id/audits', M],

  // Dashboard.
  ['GET', '/api/dashboard', R],

  // Server-side tools: AI calls, page fetching, image processing. Costly or external, never read-only safe.
  ['POST', '/api/ai/items/analyze', T],
  ['POST', '/api/ai/translate', T],
  ['POST', '/api/categories/:id/fields/ai', T],
  ['POST', '/api/images/remove-background', T],
  ['POST', '/api/items/import-url/preview', T],
  ['POST', '/api/items/import-url/:token/variant', T],
  ['POST', '/api/items/import-url/:token/ai', T],
  ['GET', '/api/items/import-url/:token/images/:index', T],

  // AI provider configuration: the key, the base URL, and calls that test them.
  ['GET', '/api/settings/ai', S],
  ['PUT', '/api/settings/ai', S],
  ['GET', '/api/ai/models', S],
  ['POST', '/api/ai/models', S],
  ['POST', '/api/ai/test', S],

  // Cloud backup: provider credentials, OAuth, and uploads of the whole database.
  ['GET', '/api/cloud-backup', S],
  ['PUT', '/api/cloud-backup/settings', S],
  ['PUT', '/api/cloud-backup/providers/:provider/app', S],
  ['DELETE', '/api/cloud-backup/providers/:provider/app', S],
  ['POST', '/api/cloud-backup/providers/:provider/connect', S],
  ['GET', '/api/cloud-backup/oauth/callback', S, { redirect: '/settings/cloud-backup?cloud=error' }],
  ['POST', '/api/cloud-backup/providers/:provider/test', S],
  ['POST', '/api/cloud-backup/providers/:provider/backup', S],
  ['DELETE', '/api/cloud-backup/providers/:provider', S],

  // The whole database and the machine.
  ['GET', '/api/backup', X],
  ['GET', '/api/restore/status', X],
  ['POST', '/api/restore/validate', X, { fresh: true }],
  ['POST', '/api/restore/apply', X, { fresh: true }],
  ['POST', '/api/database/reset/prepare', X, { fresh: true }],
  ['POST', '/api/database/reset/apply', X, { fresh: true }],
  ['GET', '/api/update/check', X],
  ['GET', '/api/update/status', X],
  ['POST', '/api/update/apply', X, { fresh: true }]
].map(([method, path, access, options = {}]) => ({ method, path, access, segments: path.split('/'), ...options }));

export const DEFAULT_RULE = Object.freeze({ method: '*', path: '*', access: A, segments: [] });

const segmentMatches = (pattern, actual) => (pattern.startsWith(':') ? actual.length > 0 : pattern === actual);

/*
  Express matches paths without regard to case or a trailing slash, so the policy does the same.
  A literal segment wins over a parameter (`/api/items/columns` before `/api/items/:id`).
*/
export function matchRoute(method, rawPath, policy = ROUTE_POLICY) {
  let path = String(rawPath).toLowerCase();
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const segments = path.split('/');
  const verb = method === 'HEAD' ? 'GET' : method;
  const candidates = policy.filter(rule => rule.method === verb && rule.segments.length === segments.length
    && rule.segments.every((segment, index) => segmentMatches(segment.toLowerCase(), segments[index])));
  if (!candidates.length) return DEFAULT_RULE;
  const literals = rule => rule.segments.filter(segment => !segment.startsWith(':')).length;
  return candidates.sort((a, b) => literals(b) - literals(a))[0];
}
