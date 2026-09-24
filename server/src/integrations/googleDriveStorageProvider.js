import fs from 'node:fs';
import { CloudStorageHttp, DEFAULT_CHUNK_BYTES, UPLOAD_TIMEOUT_MS, cloudError, fileChunks } from './cloudStorageHttp.js';

// drive.file only reaches files and folders this application created, never the rest of the Drive.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const FOLDER_PATH = ['Inventory Atlas Lite', 'Backups'];

/*
  Google Drive adapter for the cloud backup layer. Backups go to a visible "Inventory Atlas Lite /
  Backups" folder in My Drive that the application creates itself, so the user can open and download
  them in Drive while the narrow drive.file scope keeps every other file out of reach.
*/
export class GoogleDriveStorageProvider {
  // `app()` returns the current { clientId, clientSecret }, which can change while the server runs.
  constructor({ app, endpoints, chunkBytes = DEFAULT_CHUNK_BYTES }) {
    this.id = 'google-drive';
    this.label = 'Google Drive';
    this.destination = `My Drive › ${FOLDER_PATH.join(' › ')}`;
    this.appFields = { idLabel: 'client ID', secretLabel: 'client secret', secretRequired: true };
    this.app = app;
    this.endpoints = endpoints;
    this.chunkBytes = chunkBytes;
    this.http = new CloudStorageHttp({ label: this.label });
  }

  get clientId() {
    return this.app().clientId;
  }

  get clientSecret() {
    return this.app().clientSecret;
  }

  get configured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  get requiredSettings() {
    return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  }

  authorizationUrl({ state, codeChallenge, redirectUri }) {
    const url = new URL(this.endpoints.authorize);
    // prompt=consent makes Google return a refresh token on every connection, not only the first one.
    url.search = new URLSearchParams({
      client_id: this.clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, access_type: 'offline',
      prompt: 'consent', state, code_challenge: codeChallenge, code_challenge_method: 'S256'
    }).toString();
    return url.toString();
  }

  static tokens(body) {
    return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, expiresAt: Date.now() + Number(body.expires_in || 0) * 1000 };
  }

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const response = await this.http.sendForm(this.endpoints.token, {
      grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier,
      client_id: this.clientId, client_secret: this.clientSecret
    });
    if (!response.ok || !response.body?.access_token) this.http.failToken(response, 'complete the connection');
    return GoogleDriveStorageProvider.tokens(response.body);
  }

  async refresh(refreshToken) {
    const response = await this.http.sendForm(this.endpoints.token, {
      grant_type: 'refresh_token', refresh_token: refreshToken, client_id: this.clientId, client_secret: this.clientSecret
    });
    if (!response.ok || !response.body?.access_token) this.http.failToken(response, 'refresh the access');
    return GoogleDriveStorageProvider.tokens(response.body);
  }

  // Revoking the refresh token ends the whole grant, including every access token issued from it.
  async revoke(refreshToken) {
    const response = await this.http.sendForm(this.endpoints.revoke, { token: refreshToken });
    if (!response.ok) this.http.fail(response, 'revoke the access');
  }

  fail(response, task) {
    const reason = response.body?.error?.errors?.[0]?.reason || response.body?.error?.status || '';
    if (/storageQuotaExceeded|quotaExceeded/.test(reason)) {
      throw cloudError('Google Drive storage is full. Free up space or choose a smaller retention, then try again.', 507, 'quota');
    }
    if (/rateLimitExceeded|userRateLimitExceeded/.test(reason)) throw cloudError('Google Drive rate limit reached. Try again later.', 503, 'rate_limited');
    if (response.status === 403 || response.status === 404) {
      throw cloudError('Google Drive refused the backup folder. Connect Google Drive again so the application can recreate it.', 502, 'invalid_destination');
    }
    this.http.fail(response, task, task === 'upload the backup' ? 'upload_failed' : 'provider_error');
  }

  async api(accessToken, path, { method = 'GET', json, task, headers = {}, timeoutMs } = {}) {
    const options = { method, headers: { ...headers, Authorization: `Bearer ${accessToken}` }, timeoutMs };
    const url = `${this.endpoints.api}/${path}`;
    const response = json === undefined ? await this.http.send(url, options) : await this.http.sendJson(url, json, options);
    if (!response.ok) this.fail(response, task);
    return response;
  }

  async account(accessToken) {
    const { body } = await this.api(accessToken, 'drive/v3/about?fields=user(displayName,emailAddress)', { task: 'read the account' });
    const user = body?.user || {};
    return [user.displayName, user.emailAddress && (user.displayName ? `(${user.emailAddress})` : user.emailAddress)].filter(Boolean).join(' ') || 'Google account';
  }

  // Finds, or creates, one folder level. drive.file only ever sees the folders created by this app.
  async childFolder(accessToken, parentId, name) {
    const query = `name = '${name}' and mimeType = '${FOLDER_TYPE}' and '${parentId}' in parents and trashed = false`;
    const { body } = await this.api(accessToken, `drive/v3/files?${new URLSearchParams({ q: query, fields: 'files(id,name)', spaces: 'drive', pageSize: '10' })}`,
      { task: 'find the backup folder' });
    if (body?.files?.[0]?.id) return body.files[0].id;
    const created = await this.api(accessToken, 'drive/v3/files?fields=id', {
      method: 'POST', json: { name, mimeType: FOLDER_TYPE, parents: [parentId] }, task: 'create the backup folder'
    });
    if (!created.body?.id) throw cloudError('Google Drive did not create the backup folder.', 502, 'invalid_destination');
    return created.body.id;
  }

  async backupFolder(accessToken) {
    let parentId = 'root';
    for (const name of FOLDER_PATH) parentId = await this.childFolder(accessToken, parentId, name);
    return parentId;
  }

  // A resumable upload, sent in chunks so a large snapshot never has to be held in memory.
  async upload(accessToken, { file, name }) {
    const folderId = await this.backupFolder(accessToken);
    const size = fs.statSync(file).size;
    const session = await this.api(accessToken, 'upload/drive/v3/files?uploadType=resumable&fields=id,name,size', {
      method: 'POST',
      json: { name, parents: [folderId], mimeType: 'application/vnd.sqlite3' },
      headers: { 'X-Upload-Content-Type': 'application/vnd.sqlite3', 'X-Upload-Content-Length': String(size) },
      task: 'upload the backup'
    });
    const location = session.headers.get('location');
    if (!location) throw cloudError('Google Drive did not start the upload.', 502, 'upload_failed');
    let result = null;
    for await (const chunk of fileChunks(file, this.chunkBytes)) {
      const last = chunk.offset + chunk.bytes.length - 1;
      const response = await this.http.send(location, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Range': `bytes ${chunk.offset}-${last}/${size}` },
        body: chunk.bytes,
        timeoutMs: UPLOAD_TIMEOUT_MS
      });
      // 308 asks for the next chunk; 200 or 201 closes the upload with the file's metadata.
      if (response.status === 308) continue;
      if (!response.ok) this.fail(response, 'upload the backup');
      result = response.body;
    }
    if (!result?.id) throw cloudError('Google Drive did not confirm the upload.', 502, 'upload_failed');
    return { id: result.id, name, size };
  }

  async list(accessToken) {
    const folderId = await this.backupFolder(accessToken);
    const entries = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name)', spaces: 'drive', pageSize: '1000' });
      if (pageToken) query.set('pageToken', pageToken);
      const { body } = await this.api(accessToken, `drive/v3/files?${query}`, { task: 'list the backups' });
      for (const file of body?.files || []) entries.push({ id: file.id, name: file.name });
      pageToken = body?.nextPageToken || '';
    } while (pageToken);
    return entries;
  }

  async remove(accessToken, entry) {
    await this.api(accessToken, `drive/v3/files/${encodeURIComponent(entry.id)}`, { method: 'DELETE', task: 'delete an old backup' });
  }

  async check(accessToken) {
    const account = await this.account(accessToken);
    await this.backupFolder(accessToken);
    return account;
  }
}
