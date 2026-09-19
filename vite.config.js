import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The development proxy follows the same PORT the Express server uses.
const apiPort = Number(process.env.PORT) || 3000;

export default defineConfig({
  plugins: [vue()],
  // Tabler and Tabler Icons are MIT licensed: keep their /*! */ copyright banners in the bundles.
  esbuild: { legalComments: 'inline' },
  server: { host: '0.0.0.0', proxy: { '/api': `http://127.0.0.1:${apiPort}` } }
});
