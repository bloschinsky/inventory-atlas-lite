import { IconDashboard, IconDatabase, IconPackages, IconQrcode, IconSettings, IconTags } from '@tabler/icons-vue';

// Single source of truth for the desktop sidebar and the mobile offcanvas menu.
export const navigationLinks = [
  { to: '/dashboard', label: 'Dashboard', prefixes: [], icon: IconDashboard },
  { to: '/items', label: 'Items', prefixes: ['/items'], icon: IconPackages },
  { to: '/scan', label: 'Scan QR', prefixes: [], icon: IconQrcode },
  { to: '/categories', label: 'Categories & Fields', prefixes: [], icon: IconTags },
  { to: '/data', label: 'Data / Backup', prefixes: [], icon: IconDatabase },
  { to: '/settings', label: 'Settings', prefixes: [], icon: IconSettings }
];

// RouterLink would mark "/" active on every route, so the active link is matched explicitly.
export const isLinkActive = (link, path) =>
  path === link.to || link.prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
