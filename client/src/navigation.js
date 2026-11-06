import { PERMISSIONS } from '../../shared/permissions.js';
import { IconChecklist, IconDashboard, IconDatabase, IconHierarchy2, IconPackages, IconQrcode, IconSettings, IconTags, IconTemplate } from '@tabler/icons-vue';

// Single source of truth for the desktop sidebar and the mobile offcanvas menu; labels are translation keys.
// A link with a `permission` is listed only for a principal that has it (the route refuses everyone else).
export const navigationLinks = [
  { to: '/dashboard', label: 'nav.dashboard', prefixes: [], icon: IconDashboard },
  { to: '/items', label: 'nav.items', prefixes: ['/items'], icon: IconPackages },
  { to: '/hierarchy', label: 'nav.hierarchy', prefixes: [], icon: IconHierarchy2 },
  { to: '/templates', label: 'nav.templates', prefixes: ['/templates'], icon: IconTemplate, permission: PERMISSIONS.inventoryManage },
  { to: '/checklists', label: 'nav.checklists', prefixes: ['/checklists'], icon: IconChecklist },
  { to: '/scan', label: 'nav.scanQr', prefixes: [], icon: IconQrcode },
  { to: '/categories', label: 'nav.categories', prefixes: [], icon: IconTags, permission: PERMISSIONS.inventoryManage },
  { to: '/data', label: 'nav.data', prefixes: [], icon: IconDatabase, permission: PERMISSIONS.maintenanceManage },
  { to: '/settings', label: 'nav.settings', prefixes: ['/settings'], icon: IconSettings }
];

// RouterLink would mark "/" active on every route, so the active link is matched explicitly.
export const isLinkActive = (link, path) =>
  path === link.to || link.prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
