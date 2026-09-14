import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The development proxy follows the same PORT the Express server uses.
const apiPort = Number(process.env.PORT) || 3000;

export default defineConfig({
  plugins: [vue()],
  server: { host: '0.0.0.0', proxy: { '/api': `http://localhost:${apiPort}` } }
});
