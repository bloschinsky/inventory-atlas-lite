import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { SUPPORTED_LOCALES } from '../client/src/i18n/core.js';
import { screenshotFile, screenshotNames } from './screenshots.js';
import { landingRelease, siteUrl } from './site.js';

/*
  The public landing page: a separate static Vite build of landing/ into dist-landing/, published to
  GitHub Pages by .github/workflows/pages.yml. LANDING_SITE_URL is the Pages address, which also sets
  the asset base path; LANDING_RELEASE_TAG is the latest published release; LANDING_DEMO_URL, the
  address of the public demo the Pages workflow builds into the same site, shows the Try Demo button.
*/
const site = siteUrl(process.env.LANDING_SITE_URL);
const history = JSON.parse(readFileSync(new URL('../shared/release-history.json', import.meta.url), 'utf8'));

// Every supported language needs its whole screenshot set; a missing one fails the build by name.
const missing = SUPPORTED_LOCALES.flatMap(({ code }) => screenshotNames.map(name => screenshotFile(code, name)))
  .filter(file => !existsSync(new URL(`../${file}`, import.meta.url)));
if (missing.length) throw new Error(`Landing screenshots are missing: ${missing.join(', ')}. Run \`npm run landing:screenshots\`.`);

const info = {
  release: landingRelease(history, process.env.LANDING_RELEASE_TAG?.trim()),
  demoUrl: process.env.LANDING_DEMO_URL?.trim() || null
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: site.pathname,
  plugins: [
    vue(),
    // The canonical and Open Graph addresses must be absolute, so they are written into the HTML.
    { name: 'landing-site-url', transformIndexHtml: html => html.replaceAll('%SITE_URL%', site.href) }
  ],
  // Tabler and Tabler Icons are MIT licensed: keep their /*! */ copyright banners in the bundles.
  esbuild: { legalComments: 'inline' },
  define: {
    __LANDING_INFO__: JSON.stringify(info),
    // vue-i18n compile-time flags, as in the application build: Composition API only, no devtools hooks.
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false
  },
  build: {
    outDir: fileURLToPath(new URL('../dist-landing', import.meta.url)),
    emptyOutDir: true,
    // Each screenshot set keeps its language in the published path: assets/screenshots/<locale>/.
    rollupOptions: {
      output: {
        assetFileNames: ({ originalFileNames = [] }) => {
          const locale = originalFileNames[0]?.match(/screenshots[\\/]([^\\/]+)[\\/]/)?.[1];
          return locale ? `assets/screenshots/${locale}/[name]-[hash][extname]` : 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  server: { port: 5174 },
  preview: { port: 4174 }
});
