import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { landingRelease, siteUrl } from './site.js';

/*
  The public landing page: a separate static Vite build of landing/ into dist-landing/, published to
  GitHub Pages by .github/workflows/pages.yml. LANDING_SITE_URL is the Pages address, which also sets
  the asset base path; LANDING_RELEASE_TAG is the latest published release; LANDING_DEMO_URL, once
  a public demo exists, shows the Try Demo button.
*/
const site = siteUrl(process.env.LANDING_SITE_URL);
const history = JSON.parse(readFileSync(new URL('../shared/release-history.json', import.meta.url), 'utf8'));

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
  define: { __LANDING_INFO__: JSON.stringify(info) },
  build: { outDir: fileURLToPath(new URL('../dist-landing', import.meta.url)), emptyOutDir: true },
  server: { port: 5174 },
  preview: { port: 4174 }
});
