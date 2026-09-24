import path from 'node:path';
import { dataDir } from '../db.js';

const env = name => process.env[name]?.trim() || '';

// Refresh tokens and account names live here, never in inventory.sqlite, so no backup carries them.
export const credentialsFile = path.join(dataDir, 'cloud-backup-credentials.json');
// Schedule, retention, and the operational history. It holds no secrets.
export const stateFile = path.join(dataDir, 'cloud-backup.json');

/*
  The OAuth callback URL registered with the providers. Without CLOUD_BACKUP_REDIRECT_URI it is
  derived from the address the browser used, which is right for a direct LAN or localhost setup. A
  desktop build can point it at its own callback without touching the storage providers.
*/
export const redirectUriOverride = env('CLOUD_BACKUP_REDIRECT_URI');
export const callbackPath = '/api/cloud-backup/oauth/callback';

// Test-only: sends every provider request to one local stub instead of Dropbox and Google.
const testEndpoint = env('CLOUD_BACKUP_TEST_ENDPOINT').replace(/\/+$/, '');

export const dropboxConfig = {
  clientId: env('DROPBOX_APP_KEY'),
  clientSecret: env('DROPBOX_APP_SECRET'),
  endpoints: testEndpoint
    ? {
      authorize: `${testEndpoint}/dropbox/oauth2/authorize`,
      token: `${testEndpoint}/dropbox/oauth2/token`,
      api: `${testEndpoint}/dropbox/api`,
      content: `${testEndpoint}/dropbox/content`
    }
    : {
      authorize: 'https://www.dropbox.com/oauth2/authorize',
      token: 'https://api.dropboxapi.com/oauth2/token',
      api: 'https://api.dropboxapi.com',
      content: 'https://content.dropboxapi.com'
    }
};

export const googleDriveConfig = {
  clientId: env('GOOGLE_CLIENT_ID'),
  clientSecret: env('GOOGLE_CLIENT_SECRET'),
  endpoints: testEndpoint
    ? {
      authorize: `${testEndpoint}/google/auth`,
      token: `${testEndpoint}/google/token`,
      revoke: `${testEndpoint}/google/revoke`,
      api: `${testEndpoint}/google`
    }
    : {
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      revoke: 'https://oauth2.googleapis.com/revoke',
      api: 'https://www.googleapis.com'
    }
};

// The effective time zone of the server process; schedules are entered and shown in it.
export const serverTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
