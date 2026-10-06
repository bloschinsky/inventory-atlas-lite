import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { SUPPORTED_LOCALES } from '../client/src/i18n/core.js';
import { guideDiagrams, guidePresentation } from './guidePresentation.js';
import { buildGuide, presentationProblems, readDemoRoutes } from './guideSource.js';
import { screenshotFile, screenshotNames } from './screenshots.js';
import { guideSourceFile, landingRelease, siteUrl } from './site.js';

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

/*
  The public user guide (guide/index.html) is rendered from docs/HOW-TO.md and its translations by
  landing/guideSource.js. Each language is its own virtual:guide/<locale> module, loaded only when the
  page shows that language; virtual:guide lists them. A guide whose translation drifted from the
  canonical structure, or presentation metadata that names something that does not exist, fails here.
*/
function userGuide() {
  const locales = SUPPORTED_LOCALES.map(({ code }) => code);
  const check = () => {
    const demo = readDemoRoutes();
    const problems = presentationProblems(buildGuide('en'), guidePresentation, {
      screenshots: screenshotNames, diagrams: guideDiagrams, demoRoutes: demo.routes, demoUnavailable: demo.unavailable
    });
    if (problems.length) throw new Error(`landing/guidePresentation.js: ${problems.join('; ')}.`);
  };
  return {
    name: 'landing-user-guide',
    buildStart() {
      check();
      for (const locale of locales) this.addWatchFile(fileURLToPath(new URL(`../${guideSourceFile(locale)}`, import.meta.url)));
    },
    resolveId: id => (id === 'virtual:guide' || id.startsWith('virtual:guide/') ? `\0${id}` : null),
    load(id) {
      if (id === '\0virtual:guide') {
        return `export const guideLoaders = {${locales.map(code => `${JSON.stringify(code)}: () => import('virtual:guide/${code}')`).join(', ')}};`;
      }
      const locale = id.startsWith('\0virtual:guide/') && id.slice('\0virtual:guide/'.length);
      return locale ? `export default ${JSON.stringify(buildGuide(locale))};` : null;
    },
    // In development a Markdown change reloads the guide page.
    handleHotUpdate({ file, server }) {
      if (locales.some(locale => file.endsWith(guideSourceFile(locale)))) {
        for (const locale of locales) {
          const module = server.moduleGraph.getModuleById(`\0virtual:guide/${locale}`);
          if (module) server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      }
    }
  };
}

const info = {
  release: landingRelease(history, process.env.LANDING_RELEASE_TAG?.trim()),
  demoUrl: process.env.LANDING_DEMO_URL?.trim() || null
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: site.pathname,
  plugins: [
    vue(),
    userGuide(),
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
    // Two pages: the product page and the user guide, which GitHub Pages serves at guide/.
    // Each screenshot set keeps its language in the published path: assets/screenshots/<locale>/.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        guide: fileURLToPath(new URL('guide/index.html', import.meta.url))
      },
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
