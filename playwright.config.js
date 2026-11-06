import { defineConfig, devices } from '@playwright/test';
import { adminStateFile, apiPort, baseURL, clientPort, cloudStubPort, cloudStubURL, dataDir, demoURL, landingPort, landingURL } from './test/e2e/environment.js';

export default defineConfig({
  testDir: './test/e2e',
  // The tests share one isolated database, so they run one at a time and stay predictable.
  workers: 1,
  // Retries stay off locally so an unstable test is visible while it is being written.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  // Creates the e2e administrator and signs in once; the app project's pages start with that session.
  globalSetup: './test/e2e/globalSetup.js',
  /*
    The guided tour plays at its real pace and takes most of the suite's time, but it runs on the
    in-browser demo and never touches the shared database. Its own project lets CI run it as a
    separate job with several workers (`--project=tour --workers=3`); locally both still run here.
  */
  projects: [
    { name: 'app', testIgnore: 'tour.spec.js', use: { ...devices['Desktop Chrome'], storageState: adminStateFile } },
    { name: 'tour', testMatch: 'tour.spec.js', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: [
    {
      // Cloud backup talks to this stub instead of Dropbox and Google.
      command: 'node test/e2e/cloudProviderStub.js',
      url: `${cloudStubURL}/_stub/files`,
      env: { CLOUD_STUB_PORT: String(cloudStubPort) },
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: 'node server/src/index.js',
      port: apiPort,
      env: {
        PORT: String(apiPort),
        DATA_DIR: dataDir,
        CLOUD_BACKUP_TEST_ENDPOINT: cloudStubURL,
        DROPBOX_APP_KEY: 'e2e-dropbox-key',
        // Google Drive is deliberately left out: the suite enters its app credentials in Settings.
        DROPBOX_APP_SECRET: 'e2e-dropbox-secret',
        // The suite signs in once and runs longer than the default reauthentication window; the
        // password confirmation itself is exercised by auth.spec.js with an aged session.
        AUTH_REAUTH_WINDOW_MS: String(24 * 60 * 60 * 1000)
      },
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
    },
    {
      // The production landing build with the public demo inside it, as the Pages workflow publishes
      // them, served under the base path its site address names.
      command: `vite build --config landing/vite.config.js && vite build --mode demo && vite preview --config landing/vite.config.js --host 127.0.0.1 --port ${landingPort} --strictPort`,
      url: landingURL,
      // No published tag: the page must fall back to the release history.
      env: { LANDING_SITE_URL: landingURL, LANDING_RELEASE_TAG: '', LANDING_DEMO_URL: demoURL },
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ]
});
