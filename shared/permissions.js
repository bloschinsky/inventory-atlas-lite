/*
  The permission vocabulary of the server's authorization boundary, shared so the browser can hide
  what a principal may not do. Hiding is only convenience: the server checks every request against
  server/src/auth/routePolicy.js, whatever the interface shows.
*/
export const PERMISSIONS = Object.freeze({
  // Browse and search the inventory: items, photos, categories, fields, hierarchy, Dashboard,
  // history, templates, checklists and their runs, label data.
  inventoryRead: 'inventory:read',
  // Create, edit, move, retire, lend, and delete items and their photos (also bulk move and replace).
  itemsWrite: 'items:write',
  // Change the inventory's structure and routines: categories, custom fields, templates, checklists,
  // checklist runs and container audits.
  inventoryManage: 'inventory:manage',
  // Expensive or external work done by the server: AI calls, Smart URL import, background removal.
  toolsUse: 'tools:use',
  // Configuration: AI provider settings, cloud backup, the database name and content language.
  settingsManage: 'settings:manage',
  // The whole database and the machine: backup download, restore, reset, and the updater.
  maintenanceManage: 'maintenance:manage',
  // People and credentials: user accounts and API tokens.
  securityManage: 'security:manage'
});

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

export const ROLES = Object.freeze({ admin: 'admin', viewer: 'viewer' });

// Every role and exactly what it may do. The viewer never writes and never reaches configuration.
export const ROLE_PERMISSIONS = Object.freeze({
  admin: ALL_PERMISSIONS,
  viewer: Object.freeze([PERMISSIONS.inventoryRead])
});

/*
  The scopes an API token may carry. A token is always read-capable; `items:write` adds item changes
  and never anything else, so no token can reach settings, maintenance, or security.
*/
export const TOKEN_SCOPES = Object.freeze({
  'inventory:read': Object.freeze([PERMISSIONS.inventoryRead]),
  'items:write': Object.freeze([PERMISSIONS.inventoryRead, PERMISSIONS.itemsWrite])
});

export const roleExists = role => Object.hasOwn(ROLE_PERMISSIONS, role);
export const permissionsOfRole = role => (roleExists(role) ? [...ROLE_PERMISSIONS[role]] : []);
export const permissionsOfScopes = scopes => [...new Set(scopes.flatMap(scope => TOKEN_SCOPES[scope] ?? []))];
