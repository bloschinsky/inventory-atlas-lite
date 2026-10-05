import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The development proxy follows the same PORT the Express server uses.
const apiPort = Number(process.env.PORT) || 3000;

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null; // No Git binary, no repository (release archive), or no commit yet.
  }
};

// APP_* wins over Git so any pipeline can feed a build made from source without a repository.
const env = name => process.env[name]?.trim() || process.env[`VITE_${name}`]?.trim() || null;

const packageVersion = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')).version;
const commit = git('rev-parse', '--short', 'HEAD');
const tag = commit && git('describe', '--tags', '--exact-match');
// The commit timestamp is deterministic: rebuilding the same revision shows the same date.
const commitSeconds = Number(commit && git('show', '-s', '--format=%ct', 'HEAD'));
const releaseVersion = env('APP_VERSION') || tag;

/*
  The one place the application's version, revision, and source date are resolved. The client
  reads it through client/src/build-info.js, so no component ever holds a release constant.
*/
const buildInfo = {
  // A tagged commit is a release; a plain working copy is marked so it is never taken for one.
  version: releaseVersion ? releaseVersion.replace(/^v/, '') : commit ? `${packageVersion}-dev` : packageVersion,
  build: env('APP_BUILD') || commit || 'unavailable',
  buildDate: env('APP_BUILD_DATE') || (commitSeconds > 0 ? new Date(commitSeconds * 1000).toISOString().slice(0, 10) : 'unavailable')
};

/*
  The `demo` mode builds the public demo: the same client, with every API request answered in the
  browser by client/src/demo/, relative asset paths, and its output in dist-landing/demo/, which the
  Pages workflow publishes next to the landing page.
*/
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [vue()],
    base: demo ? './' : '/',
    // The demo bundles the server's route tables, which then register into a stand-in for Express.
    resolve: demo ? { alias: [{ find: /^express$/, replacement: fileURLToPath(new URL('client/src/demo/express.js', import.meta.url)) }] } : {},
    // The demo photos stay separate files instead of being inlined into the bundle.
    build: demo ? { outDir: 'dist-landing/demo', emptyOutDir: true, assetsInlineLimit: 0 } : {},
    // Tabler and Tabler Icons are MIT licensed: keep their /*! */ copyright banners in the bundles.
    esbuild: { legalComments: 'inline' },
    define: {
      __APP_BUILD_INFO__: JSON.stringify(buildInfo),
      __DEMO__: JSON.stringify(demo),
      // vue-i18n compile-time flags: Composition API only, and no devtools hooks in production bundles.
      __VUE_I18N_FULL_INSTALL__: true,
      __VUE_I18N_LEGACY_API__: false,
      __INTLIFY_PROD_DEVTOOLS__: false
    },
    // Tabler ships ApexCharts as a UMD bundle; pre-bundling gives the development server its ES module form.
    optimizeDeps: { include: ['@tabler/core/dist/libs/apexcharts/dist/apexcharts.min.js'] },
    server: { host: '0.0.0.0', proxy: demo ? {} : { '/api': `http://127.0.0.1:${apiPort}` } }
  };
});
