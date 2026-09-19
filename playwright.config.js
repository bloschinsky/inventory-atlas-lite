import { defineConfig, devices } from '@playwright/test';
import { apiPort, baseURL, clientPort, dataDir } from './test/e2e/environment.js';

export default defineConfig({
  testDir: './test/e2e',
  // The tests share one isolated database, so they run one at a time and stay predictable.
  workers: 1,
  // Retries stay off locally so an unstable test is visible while it is being written.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node server/src/index.js',
      port: apiPort,
      env: { PORT: String(apiPort), DATA_DIR: dataDir },
      // Never adopt an already running server: its data directory would be unknown.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: `vite --port ${clientPort} --strictPort`,
      port: clientPort,
      // Vite proxies /api to the same port the test API listens on.
      env: { PORT: String(apiPort) },
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ]
});
