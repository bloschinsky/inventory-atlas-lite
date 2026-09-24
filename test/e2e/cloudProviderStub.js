import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

/*
  A local stand-in for the parts of the Dropbox and Google Drive APIs the cloud backup uses: OAuth
  with PKCE and refresh tokens, account info, chunked uploads, listing, deletion, and revocation.
  The application reaches it through CLOUD_BACKUP_TEST_ENDPOINT, so no real account is ever needed.
  The Node.js tests drive it in process; the browser suite runs it as a separate server and reads
  its state over the /_stub routes.
*/
export async function startCloudProviderStub({ port = 0 } = {}) {
  const stub = {
    requests: [],
    // Each entry { match, status, body, times } answers matching requests with a fixed failure.
    failures: [],
    denyNext: false,
    accessTtlSeconds: 3600,
    reset() {
      Object.assign(stub, { requests: [], failures: [], denyNext: false, accessTtlSeconds: 3600 });
      stub.codes = new Map();
      stub.refreshTokens = new Map();
      stub.accessTokens = new Map();
      stub.dropboxFiles = new Map();
      stub.dropboxSessions = new Map();
      stub.googleFiles = new Map();
      stub.googleSessions = new Map();
    },
    revokeAll() {
      for (const entry of stub.refreshTokens.values()) entry.revoked = true;
      stub.accessTokens.clear();
    },
    dropboxNames: () => [...stub.dropboxFiles.values()].map(file => file.name).sort(),
    googleBackups: () => [...stub.googleFiles.values()].filter(file => file.data).map(file => file.name).sort(),
    // Files are keyed by their lower-case path, as Dropbox matches paths, and keep their own name.
    dropboxFile: (path, data) => stub.dropboxFiles.set(path.toLowerCase(), { name: path.split('/').pop(), data }),
    // Every token the stub has issued; the tests check that none of them leaks anywhere.
    secrets: () => [...stub.refreshTokens.keys(), ...stub.accessTokens.keys()]
  };
  stub.reset();

  const counter = { value: 0 };
  const next = prefix => `${prefix}-${++counter.value}-${crypto.randomBytes(6).toString('hex')}`;

  const issue = (provider, withRefresh, refreshToken) => {
    const accessToken = next(`${provider}-access`);
    stub.accessTokens.set(accessToken, { provider, refreshToken, expiresAt: Date.now() + stub.accessTtlSeconds * 1000 });
    const body = { access_token: accessToken, token_type: 'bearer', expires_in: stub.accessTtlSeconds };
    if (withRefresh) body.refresh_token = refreshToken;
    return body;
  };

  const authorized = (req, provider) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const entry = stub.accessTokens.get(token);
    return entry && entry.provider === provider && entry.expiresAt > Date.now() && !stub.refreshTokens.get(entry.refreshToken)?.revoked ? entry : null;
  };

  const oauthRedirect = (res, url, provider) => {
    const target = new URL(url.searchParams.get('redirect_uri'));
    target.searchParams.set('state', url.searchParams.get('state'));
    if (stub.denyNext) {
      stub.denyNext = false;
      target.searchParams.set('error', 'access_denied');
    } else {
      const code = next(`${provider}-code`);
      stub.codes.set(code, { provider, challenge: url.searchParams.get('code_challenge'), redirectUri: url.searchParams.get('redirect_uri') });
      target.searchParams.set('code', code);
    }
    res.writeHead(302, { Location: target.toString() }).end();
  };

  const token = (provider, form) => {
    if (!form.get('client_id')) return [401, { error: 'invalid_client' }];
    if (form.get('grant_type') === 'authorization_code') {
      const grant = stub.codes.get(form.get('code'));
      stub.codes.delete(form.get('code'));
      const verifier = crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
      if (!grant || grant.provider !== provider || grant.redirectUri !== form.get('redirect_uri') || verifier !== grant.challenge) {
        return [400, { error: 'invalid_grant' }];
      }
      const refreshToken = next(`${provider}-refresh-secret`);
      stub.refreshTokens.set(refreshToken, { provider, revoked: false });
      return [200, issue(provider, true, refreshToken)];
    }
    const entry = stub.refreshTokens.get(form.get('refresh_token'));
    if (!entry || entry.revoked || entry.provider !== provider) return [400, { error: 'invalid_grant' }];
    return [200, issue(provider, false, form.get('refresh_token'))];
  };

  const dropbox = (req, res, url, raw, send) => {
    const route = url.pathname.slice('/dropbox'.length);
    if (route === '/oauth2/authorize') return oauthRedirect(res, url, 'dropbox');
    if (route === '/oauth2/token') return send(...token('dropbox', new URLSearchParams(raw.toString())));
    const caller = authorized(req, 'dropbox');
    if (!caller) return send(401, { error_summary: 'expired_access_token/' });
    const args = route.startsWith('/content/') ? JSON.parse(req.headers['dropbox-api-arg'] || '{}') : (raw.length ? JSON.parse(raw.toString()) : null);
    switch (route) {
      case '/api/2/users/get_current_account':
        return send(200, { name: { display_name: 'Stub Dropbox User' }, email: 'dropbox-user@example.test' });
      case '/api/2/auth/token/revoke':
        stub.refreshTokens.get(caller.refreshToken).revoked = true;
        return send(200, null);
      case '/content/2/files/upload_session/start': {
        const sessionId = next('session');
        stub.dropboxSessions.set(sessionId, [raw]);
        return send(200, { session_id: sessionId });
      }
      case '/content/2/files/upload_session/append_v2': {
        const chunks = stub.dropboxSessions.get(args.cursor.session_id);
        if (!chunks || Buffer.concat(chunks).length !== args.cursor.offset) return send(409, { error_summary: 'incorrect_offset/' });
        chunks.push(raw);
        return send(200, null);
      }
      case '/content/2/files/upload_session/finish': {
        const chunks = stub.dropboxSessions.get(args.cursor.session_id);
        const data = Buffer.concat([...(chunks || []), raw]);
        if (!chunks || data.length !== args.cursor.offset) return send(409, { error_summary: 'lookup_failed/incorrect_offset/' });
        const key = args.commit.path.toLowerCase();
        if (stub.dropboxFiles.has(key)) return send(409, { error_summary: 'path/conflict/file/' });
        stub.dropboxFiles.set(key, { name: args.commit.path.split('/').pop(), data });
        return send(200, { id: next('id'), name: args.commit.path.split('/').pop(), size: data.length });
      }
      case '/api/2/files/list_folder': {
        const prefix = `${args.path.toLowerCase()}/`;
        const entries = [...stub.dropboxFiles.keys()].filter(key => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .map(key => ({ '.tag': 'file', name: stub.dropboxFiles.get(key).name, path_lower: key }));
        if (!entries.length) return send(409, { error_summary: 'path/not_found/' });
        return send(200, { entries, has_more: false, cursor: 'end' });
      }
      case '/api/2/files/delete_v2':
        if (!stub.dropboxFiles.delete(args.path.toLowerCase())) return send(409, { error_summary: 'path_lookup/not_found/' });
        return send(200, { metadata: { path_lower: args.path } });
      default:
        return send(404, { error_summary: 'unknown_route/' });
    }
  };

  const google = (req, res, url, raw, send) => {
    const route = url.pathname.slice('/google'.length);
    if (route === '/auth') return oauthRedirect(res, url, 'google');
    if (route === '/token') return send(...token('google', new URLSearchParams(raw.toString())));
    if (route === '/revoke') {
      const entry = stub.refreshTokens.get(new URLSearchParams(raw.toString()).get('token'));
      if (entry) entry.revoked = true;
      return send(200, {});
    }
    if (!authorized(req, 'google')) return send(401, { error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } });
    if (route === '/drive/v3/about') return send(200, { user: { displayName: 'Stub Google User', emailAddress: 'drive-user@example.test' } });
    if (route === '/drive/v3/files' && req.method === 'GET') {
      const query = url.searchParams.get('q');
      const parent = /'([^']+)' in parents/.exec(query)?.[1];
      const name = /name = '([^']+)'/.exec(query)?.[1];
      const files = [...stub.googleFiles.values()].filter(file => file.parents.includes(parent) && (!name || file.name === name))
        .map(file => ({ id: file.id, name: file.name }));
      return send(200, { files });
    }
    if (route === '/drive/v3/files' && req.method === 'POST') {
      const metadata = JSON.parse(raw.toString());
      const id = next('folder');
      stub.googleFiles.set(id, { id, name: metadata.name, mimeType: metadata.mimeType, parents: metadata.parents });
      return send(200, { id });
    }
    if (route.startsWith('/drive/v3/files/') && req.method === 'DELETE') {
      const id = decodeURIComponent(route.slice('/drive/v3/files/'.length));
      if (!stub.googleFiles.delete(id)) return send(404, { error: { code: 404, message: 'File not found' } });
      return send(204, null);
    }
    if (route === '/upload/drive/v3/files' && req.method === 'POST') {
      const metadata = JSON.parse(raw.toString());
      if (!stub.googleFiles.has(metadata.parents?.[0])) return send(404, { error: { code: 404, message: 'File not found' } });
      const id = next('upload');
      stub.googleSessions.set(id, { metadata, size: Number(req.headers['x-upload-content-length']), chunks: [] });
      res.writeHead(200, { Location: `http://${req.headers.host}/google/upload/session/${id}` }).end();
      return undefined;
    }
    if (route.startsWith('/upload/session/') && req.method === 'PUT') {
      const session = stub.googleSessions.get(route.slice('/upload/session/'.length));
      if (!session) return send(404, { error: { code: 404, message: 'Upload session not found' } });
      const [, start, end, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers['content-range']).map(Number);
      if (start !== Buffer.concat(session.chunks).length || end - start + 1 !== raw.length || total !== session.size) {
        return send(400, { error: { code: 400, message: 'Invalid Content-Range' } });
      }
      session.chunks.push(raw);
      if (end + 1 < total) { res.writeHead(308, { Range: `bytes=0-${end}` }).end(); return undefined; }
      const id = next('file');
      const data = Buffer.concat(session.chunks);
      stub.googleFiles.set(id, { id, name: session.metadata.name, mimeType: session.metadata.mimeType, parents: session.metadata.parents, data });
      return send(200, { id, name: session.metadata.name, size: String(data.length) });
    }
    return send(404, { error: { code: 404, message: 'Unknown route' } });
  };

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://stub');
    const send = (status, body) => {
      res.writeHead(status, body === null ? {} : { 'Content-Type': 'application/json' });
      res.end(body === null ? '' : JSON.stringify(body));
    };
    if (url.pathname.startsWith('/_stub/')) {
      if (url.pathname === '/_stub/files') return send(200, { dropbox: stub.dropboxNames(), google: stub.googleBackups(), secrets: stub.secrets() });
      if (url.pathname === '/_stub/reset') { stub.reset(); return send(200, {}); }
      if (url.pathname === '/_stub/deny') { stub.denyNext = true; return send(200, {}); }
      return send(404, {});
    }
    stub.requests.push({ method: req.method, path: url.pathname });
    const failure = stub.failures.find(entry => entry.times > 0 && url.pathname.includes(entry.match));
    if (failure) {
      failure.times -= 1;
      return send(failure.status, failure.body ?? null);
    }
    if (url.pathname.startsWith('/dropbox/')) return dropbox(req, res, url, raw, send);
    if (url.pathname.startsWith('/google/')) return google(req, res, url, raw, send);
    return send(404, {});
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  stub.url = `http://127.0.0.1:${server.address().port}`;
  stub.close = () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  return stub;
}

// Run directly, it serves the browser suite on CLOUD_STUB_PORT until Playwright stops it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stub = await startCloudProviderStub({ port: Number(process.env.CLOUD_STUB_PORT) });
  console.log(`Cloud provider stub listening on ${stub.url}`);
}
