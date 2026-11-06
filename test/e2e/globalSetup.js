import fs from 'node:fs';
import { provisionUser } from '../serverProcess.js';
import { adminSessionFile, adminStateFile, apiPort, dataDir, e2eAdmin } from './environment.js';

/*
  Signs the suite in once. The administrator is created directly in the test data directory's
  security store, as `npm run auth` would, and then signs in through the real API. The session
  cookie becomes the browser state of the app project (playwright.config.js), and its anti-CSRF
  token is what fixtures.js sends with the setup requests the specs make through `request`.
*/
export default async function globalSetup() {
  await provisionUser(dataDir, { ...e2eAdmin, role: 'admin' });
  const deadline = Date.now() + 60_000;
  let response;
  for (;;) {
    try {
      response = await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e2eAdmin)
      });
      break;
    } catch (error) {
      // The API server may still be starting.
      if (Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  if (!response.ok) throw new Error(`The e2e administrator could not sign in (${response.status}).`);
  const [name, value] = response.headers.getSetCookie()[0].split(';')[0].split('=');
  const { csrfToken } = await response.json();
  const cookie = { name, value, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' };
  fs.writeFileSync(adminStateFile, JSON.stringify({ cookies: [cookie], origins: [] }));
  fs.writeFileSync(adminSessionFile, JSON.stringify({ csrfToken }));
}
