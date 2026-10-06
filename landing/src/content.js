/*
  The structure of the landing page: section ids, icons, story order, screenshot names, and links.
  Every visible word comes from the locale messages in ./locales/ (see ./i18n.js) by these keys, so
  the structure exists once for every language. Screenshots are real captures of the public demo in
  each language, made by landing/scripts/capture-screenshots.mjs.
*/
import {
  IconBrandDocker, IconCategory, IconChartPie, IconChecklist, IconDownload, IconQrcode, IconServer2, IconSitemap, IconTerminal2
} from '@tabler/icons-vue';
import { links } from '../site.js';

export const info = __LANDING_INFO__;

/*
  One screenshot set per locale. The URLs of every set are known up front, but a browser downloads an
  image only when the page shows it, which is only ever the set of the active language.
*/
const screenshotUrls = import.meta.glob('./assets/screenshots/*/*.webp', { eager: true, import: 'default' });
export const screenshotUrl = (locale, name) => screenshotUrls[`./assets/screenshots/${locale}/${name}.webp`];

/*
  Every screenshot has a short caption, "Page · what it shows" (`screenshots.<name>.caption`), shown
  under it in the showcase and as the title of the screenshot viewer, and a full description as its
  alt text (`screenshots.<name>.alt`).
*/
export const hero = [{ name: 'items' }, { name: 'item-phone', phone: true }];

// The facts rail under the hero: the technical identity of the product in a term and one short line.
export const facts = ['selfHosted', 'sqlite', 'docker', 'proxmox', 'noAccounts', 'localFirst'];

// The showcase story: each section is numbered in order (01 / Organize) and named by one verb.
export const sections = [
  { id: 'hierarchy', icon: IconSitemap, media: [{ name: 'hierarchy' }] },
  { id: 'items', icon: IconCategory, media: [{ name: 'item-details' }] },
  { id: 'photos-qr', icon: IconQrcode, media: [{ name: 'labels' }] },
  { id: 'find', icon: IconChecklist, media: [{ name: 'items-search' }, { name: 'checklist-run-phone', phone: true }] },
  { id: 'dashboard', icon: IconChartPie, media: [{ name: 'dashboard' }] }
];

export const installOptions = [
  { id: 'release', icon: IconDownload, link: links.releases },
  { id: 'docker', icon: IconBrandDocker, link: links.docker },
  { id: 'proxmox', icon: IconServer2, link: links.proxmox },
  { id: 'node', icon: IconTerminal2, link: links.manual }
];

/*
  Try Demo opens the demo in the page language: ?lang= is the explicit choice the demo applies before
  its saved preference, and the hash route is the demo's start page.
*/
export function demoLink(locale) {
  const url = new URL(info.demoUrl, window.location.href);
  url.searchParams.set('lang', locale);
  url.hash = '#/dashboard';
  return url.href;
}
