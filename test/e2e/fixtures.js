import fs from 'node:fs';
import { expect, test as base } from '@playwright/test';
import { adminSessionFile, adminStateFile } from './environment.js';

/*
  The suite's `test`: the browser pages start signed in as the e2e administrator (the app project's
  storageState), and the `request` fixture the specs use to prepare data is that same session with
  its anti-CSRF header, exactly what the application's own pages send.
*/
export const test = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const { csrfToken } = JSON.parse(fs.readFileSync(adminSessionFile, 'utf8'));
    const request = await playwright.request.newContext({ baseURL, storageState: adminStateFile, extraHTTPHeaders: { 'X-CSRF-Token': csrfToken } });
    await use(request);
    await request.dispose();
  }
});

export { expect };
