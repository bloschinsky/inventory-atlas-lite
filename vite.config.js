import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

export default defineConfig({
  plugins: [vue()],
  // Tabler and Tabler Icons are MIT licensed: keep their /*! */ copyright banners in the bundles.
  esbuild: { legalComments: 'inline' },
  define: { __APP_BUILD_INFO__: JSON.stringify(buildInfo) },
  server: { host: '0.0.0.0', proxy: { '/api': `http://127.0.0.1:${apiPort}` } }
});
