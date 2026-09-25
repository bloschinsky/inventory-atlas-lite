import { API_TIMEOUT_MS, CloudStorageHttp, DEFAULT_CHUNK_BYTES, UPLOAD_TIMEOUT_MS, cloudError, fileChunks } from './cloudStorageHttp.js';

// App-folder access plus only what backups need: the account name, listing, and writing files.
const SCOPES = 'account_info.read files.metadata.read files.content.write';
// Relative to the app folder, which Dropbox places at Apps/<app name>/ in the user's Dropbox.
const FOLDER = '/Backups';

/*
  Dropbox adapter for the cloud backup layer. The app is expected to use "App folder" access, so the
  application cannot see or touch anything else in the user's Dropbox. Uploads always use an upload
  session, which also covers snapshots larger than the 150 MB single-request limit.
*/
export class DropboxStorageProvider {
  // `app()` returns the current { clientId, clientSecret }, which can change while the server runs.
  constructor({ app, endpoints, chunkBytes = DEFAULT_CHUNK_BYTES }) {
    this.id = 'dropbox';
    this.label = 'Dropbox';
    this.destination = 'Dropbox › Apps › (your app folder) › Backups';
    // The secret is optional: the authorization code flow is protected by PKCE either way.
    this.appFields = { idLabel: 'app key', secretLabel: 'app secret', secretRequired: false };
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
    return Boolean(this.clientId);
  }

  get requiredSettings() {
    return ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET'];
  }

  authorizationUrl({ state, codeChallenge, redirectUri }) {
    const url = new URL(this.endpoints.authorize);
    url.search = new URLSearchParams({
      client_id: this.clientId, response_type: 'code', redirect_uri: redirectUri, state, scope: SCOPES,
      token_access_type: 'offline', code_challenge: codeChallenge, code_challenge_method: 'S256'
    }).toString();
    return url.toString();
  }

  clientFields() {
    return this.clientSecret ? { client_id: this.clientId, client_secret: this.clientSecret } : { client_id: this.clientId };
  }

  static tokens(body) {
    return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, expiresAt: Date.now() + Number(body.expires_in || 0) * 1000 };
  }

  async exchangeCode({ code, codeVerifier, redirectUri }) {
    const response = await this.http.sendForm(this.endpoints.token, {
      grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier, ...this.clientFields()
    });
    if (!response.ok || !response.body?.access_token) this.http.failToken(response, 'complete the connection');
    return DropboxStorageProvider.tokens(response.body);
  }

  async refresh(refreshToken) {
    const response = await this.http.sendForm(this.endpoints.token, { grant_type: 'refresh_token', refresh_token: refreshToken, ...this.clientFields() });
    if (!response.ok || !response.body?.access_token) this.http.failToken(response, 'refresh the access');
    return DropboxStorageProvider.tokens(response.body);
  }

  // Revoking one access token of the grant also disables its refresh token.
  async revoke(refreshToken) {
    const { accessToken } = await this.refresh(refreshToken);
    const response = await this.http.send(`${this.endpoints.api}/2/auth/token/revoke`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) this.http.fail(response, 'revoke the access');
  }

  // Dropbox reports most failures as HTTP 409 with a path-like error summary.
  fail(response, task) {
    const summary = String(response.body?.error_summary || '');
    if (/insufficient_space|insufficient_quota/.test(summary)) {
      throw cloudError(507, 'CLOUD_QUOTA', 'quota', { provider: 'Dropbox' });
    }
    if (/malformed_path|disallowed_name|no_write_permission|conflict/.test(summary)) {
      throw cloudError(502, 'DROPBOX_FOLDER_REFUSED', 'invalid_destination');
    }
    this.http.fail(response, task, task === 'upload the backup' ? 'upload_failed' : 'provider_error');
  }

  async rpc(accessToken, path, args, task) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = args === undefined
      ? await this.http.send(`${this.endpoints.api}/2/${path}`, { headers })
      : await this.http.sendJson(`${this.endpoints.api}/2/${path}`, args, { headers });
    if (!response.ok) this.fail(response, task);
    return response.body;
  }

  async content(accessToken, path, args, bytes) {
    const response = await this.http.send(`${this.endpoints.content}/2/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify(args) },
      body: bytes,
      timeoutMs: bytes.length ? UPLOAD_TIMEOUT_MS : API_TIMEOUT_MS
    });
    if (!response.ok) this.fail(response, 'upload the backup');
    return response.body;
  }

  async account(accessToken) {
    const body = await this.rpc(accessToken, 'users/get_current_account', undefined, 'read the account');
    const name = body?.name?.display_name;
    return [name, body?.email && (name ? `(${body.email})` : body.email)].filter(Boolean).join(' ') || 'Dropbox account';
  }

  async upload(accessToken, { file, name }) {
    let sessionId = null;
    let size = 0;
    for await (const chunk of fileChunks(file, this.chunkBytes)) {
      if (sessionId === null) {
        sessionId = (await this.content(accessToken, 'files/upload_session/start', { close: false }, chunk.bytes))?.session_id;
        if (!sessionId) throw cloudError(502, 'CLOUD_UPLOAD_NOT_STARTED', 'upload_failed', { provider: 'Dropbox' });
      } else {
        await this.content(accessToken, 'files/upload_session/append_v2', { cursor: { session_id: sessionId, offset: chunk.offset }, close: false }, chunk.bytes);
      }
      size = chunk.offset + chunk.bytes.length;
    }
    if (sessionId === null) throw cloudError(500, 'BACKUP_SNAPSHOT_EMPTY', 'upload_failed');
    const metadata = await this.content(accessToken, 'files/upload_session/finish', {
      cursor: { session_id: sessionId, offset: size },
      commit: { path: `${FOLDER}/${name}`, mode: 'add', autorename: false, mute: true }
    }, Buffer.alloc(0));
    return { id: metadata?.id ?? null, name, size };
  }

  // Only the files directly inside the app's Backups folder; a folder that does not exist yet is empty.
  async list(accessToken) {
    const entries = [];
    const headers = { Authorization: `Bearer ${accessToken}` };
    let response = await this.http.sendJson(`${this.endpoints.api}/2/files/list_folder`, { path: FOLDER, recursive: false }, { headers });
    for (;;) {
      if (!response.ok) {
        if (/path\/not_found/.test(String(response.body?.error_summary || ''))) return [];
        this.fail(response, 'list the backups');
      }
      for (const entry of response.body?.entries || []) {
        if (entry['.tag'] === 'file') entries.push({ id: entry.path_lower, name: entry.name });
      }
      if (!response.body?.has_more) return entries;
      response = await this.http.sendJson(`${this.endpoints.api}/2/files/list_folder/continue`, { cursor: response.body.cursor }, { headers });
    }
  }

  async remove(accessToken, entry) {
    await this.rpc(accessToken, 'files/delete_v2', { path: entry.id }, 'delete an old backup');
  }

  // The connection test: the account is readable and the backup folder can be listed.
  async check(accessToken) {
    const account = await this.account(accessToken);
    await this.list(accessToken);
    return account;
  }
}
