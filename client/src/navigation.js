import { IconDatabase, IconPackages, IconTags } from '@tabler/icons-vue';

// Single source of truth for the desktop sidebar and the mobile offcanvas menu.
export const navigationLinks = [
  { to: '/', label: 'Items', prefixes: ['/items'], icon: IconPackages },
  { to: '/categories', label: 'Categories & Fields', prefixes: [], icon: IconTags },
  { to: '/data', label: 'Data / Backup', prefixes: [], icon: IconDatabase }
];

// RouterLink would mark "/" active on every route, so the active link is matched explicitly.
export const isLinkActive = (link, path) =>
  path === link.to || link.prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
