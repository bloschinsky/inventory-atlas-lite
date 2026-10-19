import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../client/src/i18n/core.js';
import { localizeShell, ogLocales, publicPagePath } from './publicPages.js';

const messages = code => JSON.parse(fs.readFileSync(new URL(`./src/locales/${code}.json`, import.meta.url), 'utf8'));
const otherLocales = SUPPORTED_LOCALES.map(({ code }) => code).filter(code => code !== DEFAULT_LOCALE);

/*
  Writes one static HTML shell per public page and supported locale (landing/publicPages.js) from
  the page Vite has built, so every address of the site returns real HTML with its own metadata on
  GitHub Pages, without a server or a redirect. The shells of one page share its scripts and styles:
  `pages` maps a built HTML file (relative to the output folder) to its public page, and `siteDir`
  is the site root relative to the output folder — the demo is built into demo/ of the site, and its
  relative asset addresses are rewritten for a shell in another folder.

  In development the landing serves the shell of the address's locale from the same source page.
*/
export function publicPageShells({ site, pages, siteDir = '.' }) {
  const meta = Object.fromEntries(SUPPORTED_LOCALES.map(({ code }) => [code, messages(code).meta]));
  for (const { code } of SUPPORTED_LOCALES) {
    if (!ogLocales[code]) throw new Error(`landing/publicPages.js has no Open Graph locale for ${code}.`);
    for (const page of new Set(Object.values(pages))) {
      if (!meta[code]?.[page]) throw new Error(`landing/src/locales/${code}.json has no meta.${page} messages.`);
    }
  }
  const shell = (html, page, locale) => localizeShell(html, { site, page, locale, meta: meta[locale][page] });
  let root;
  let outDir;
  let base;

  return {
    name: 'public-page-shells',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const code = otherLocales.find(candidate => req.url.startsWith(`${base}${candidate}/`));
        if (code) req.url = `${base}${req.url.slice(base.length + code.length + 1)}`;
        next();
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, { filename, originalUrl, server }) {
        const page = pages[path.relative(root, filename).replaceAll('\\', '/')];
        if (!server || !page) return html;
        const pathname = new URL(originalUrl ?? base, 'http://localhost').pathname;
        return shell(html, page, otherLocales.find(code => pathname.startsWith(`${base}${code}/`)) ?? DEFAULT_LOCALE);
      }
    },
    writeBundle() {
      for (const [file, page] of Object.entries(pages)) {
        const source = path.join(outDir, file);
        const html = fs.readFileSync(source, 'utf8');
        for (const { code } of SUPPORTED_LOCALES) {
          const target = path.join(outDir, siteDir, publicPagePath(page, code), 'index.html');
          const prefix = path.relative(path.dirname(target), path.dirname(source)).replaceAll('\\', '/');
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, shell(prefix ? html.replaceAll('="./', `="${prefix}/`) : html, page, code));
        }
      }
    }
  };
}
