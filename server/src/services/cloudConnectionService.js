import crypto from 'node:crypto';
import { httpError } from '../httpError.js';

const PENDING_TTL_MS = 10 * 60 * 1000;
// Access tokens are refreshed this long before they expire, so an upload never starts on a dying one.
const EXPIRY_MARGIN_MS = 60 * 1000;

const base64url = bytes => bytes.toString('base64url');

/*
  Owns the OAuth connections of the cloud storage providers: starting and completing the
  authorization-code flow with PKCE and a single-use state, the stored refresh tokens, and a valid
  access token for every provider call. Refresh tokens stay in their own file under DATA_DIR; access
  tokens are only kept in memory. Nothing secret ever leaves this class towards the client.
*/
export class CloudConnectionService {
  constructor({ providers, credentialsStore, redirectUriOverride = '', callbackPath }) {
    this.providers = new Map(providers.map(provider => [provider.id, provider]));
    this.credentialsStore = credentialsStore;
    this.redirectUriOverride = redirectUriOverride;
    this.callbackPath = callbackPath;
    this.pending = new Map();
    this.accessTokens = new Map();
    // The outcome of the last failed OAuth callback, shown by Settings after the redirect back.
    this.lastConnectError = null;
  }

  provider(id) {
    const provider = this.providers.get(id);
    if (!provider) throw httpError('Unknown cloud storage provider.', 404);
    return provider;
  }

  configuredProvider(id) {
    const provider = this.provider(id);
    if (!provider.configured) {
      throw httpError(`${provider.label} is not configured on this server. Set ${provider.requiredSettings.join(' and ')} and restart the application.`, 409);
    }
    return provider;
  }

  connection(id) {
    return this.credentialsStore.read()[id] || null;
  }

  connectedIds() {
    const credentials = this.credentialsStore.read();
    return [...this.providers.keys()].filter(id => credentials[id]?.refreshToken);
  }

  redirectUri(origin) {
    return this.redirectUriOverride || `${origin}${this.callbackPath}`;
  }

  /*
    The client-safe view of every provider: configuration, connection, and destination, never tokens.
    `redirectUri` is only set when it is configured; otherwise it follows the browser's own address.
  */
  publicProviders() {
    const credentials = this.credentialsStore.read();
    return [...this.providers.values()].map(provider => ({
      id: provider.id,
      label: provider.label,
      configured: provider.configured,
      requiredSettings: provider.requiredSettings,
      connected: Boolean(credentials[provider.id]?.refreshToken),
      account: credentials[provider.id]?.account ?? null,
      connectedAt: credentials[provider.id]?.connectedAt ?? null,
      destination: provider.destination,
      redirectUri: this.redirectUriOverride || null
    }));
  }

  // Starts a connection: a fresh random state and PKCE verifier, kept here for ten minutes and used once.
  begin(id, origin) {
    const provider = this.configuredProvider(id);
    const now = Date.now();
    for (const [key, entry] of this.pending) if (entry.expiresAt <= now) this.pending.delete(key);
    const state = base64url(crypto.randomBytes(32));
    const codeVerifier = base64url(crypto.randomBytes(48));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const redirectUri = this.redirectUri(origin);
    this.pending.set(state, { providerId: id, codeVerifier, redirectUri, expiresAt: now + PENDING_TTL_MS });
    this.lastConnectError = null;
    return { state, authorizationUrl: provider.authorizationUrl({ state, codeChallenge, redirectUri }) };
  }

  /*
    Completes the callback. The state must match the one this browser received in its cookie and a
    pending connection started here; it is consumed before anything else happens, so a replayed or
    forged callback can never store tokens.
  */
  async complete({ state, cookieState, code, error }) {
    let providerLabel = 'The provider';
    try {
      const pending = typeof state === 'string' ? this.pending.get(state) : undefined;
      // The cookie binds the callback to the browser that pressed Connect.
      if (!pending || cookieState !== state) {
        throw httpError('The connection request could not be verified. Start Connect again from Settings.', 400);
      }
      this.pending.delete(state);
      const provider = this.configuredProvider(pending.providerId);
      providerLabel = provider.label;
      if (pending.expiresAt <= Date.now()) throw httpError(`The ${provider.label} connection request expired. Start Connect again.`, 400);
      if (error) {
        throw httpError(error === 'access_denied'
          ? `${provider.label} access was not granted, so nothing was connected.`
          : `${provider.label} did not complete the connection. Try again.`, 400);
      }
      if (typeof code !== 'string' || !code) throw httpError(`${provider.label} did not return an authorization code. Try again.`, 400);
      const tokens = await provider.exchangeCode({ code, codeVerifier: pending.codeVerifier, redirectUri: pending.redirectUri });
      if (!tokens.refreshToken) throw httpError(`${provider.label} did not grant offline access, which scheduled backups need. Try again.`, 502);
      const account = await provider.account(tokens.accessToken);
      this.credentialsStore.update(credentials => {
        credentials[provider.id] = { account, connectedAt: new Date().toISOString(), refreshToken: tokens.refreshToken };
      });
      this.accessTokens.set(provider.id, { token: tokens.accessToken, expiresAt: tokens.expiresAt });
      this.lastConnectError = null;
      console.log(`[cloud-backup] ${provider.label} connected`);
      return { provider: provider.id, label: provider.label, account };
    } catch (caught) {
      const message = caught.status ? caught.message : `${providerLabel} could not be connected. Try again.`;
      if (!caught.status) console.error('[cloud-backup] connection failed', caught);
      this.lastConnectError = { message, at: new Date().toISOString() };
      throw httpError(message, caught.status || 500);
    }
  }

  async refresh(provider, refreshToken) {
    const tokens = await provider.refresh(refreshToken);
    const cached = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
    this.accessTokens.set(provider.id, cached);
    // Providers may rotate the refresh token; the new one replaces the stored one.
    if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
      this.credentialsStore.update(credentials => { if (credentials[provider.id]) credentials[provider.id].refreshToken = tokens.refreshToken; });
    }
    return cached.token;
  }

  /*
    Runs `work(provider, accessToken)` with a valid access token, refreshing it when it expired. A
    token the provider rejects anyway is refreshed once and the work retried, so an unattended
    scheduled backup survives an access token revoked early by the provider.
  */
  async withAccess(id, work) {
    const provider = this.configuredProvider(id);
    const refreshToken = this.connection(id)?.refreshToken;
    if (!refreshToken) throw httpError(`${provider.label} is not connected. Connect it in Settings first.`, 409);
    const cached = this.accessTokens.get(id);
    const fresh = !cached || cached.expiresAt - EXPIRY_MARGIN_MS <= Date.now();
    const token = fresh ? await this.refresh(provider, refreshToken) : cached.token;
    try {
      return await work(provider, token);
    } catch (error) {
      if (error.code !== 'unauthorized' || fresh) throw error;
      return work(provider, await this.refresh(provider, refreshToken));
    }
  }

  async test(id) {
    const account = await this.withAccess(id, (provider, token) => provider.check(token));
    this.credentialsStore.update(credentials => { if (credentials[id]) credentials[id].account = account; });
    return { message: `Connected to ${this.provider(id).label} as ${account}.`, account };
  }

  // Revokes the grant where the provider still accepts it, then forgets the tokens in every case.
  async disconnect(id) {
    const provider = this.provider(id);
    const refreshToken = this.connection(id)?.refreshToken;
    let revoked = false;
    if (refreshToken && provider.configured) {
      try { await provider.revoke(refreshToken); revoked = true; } catch (error) {
        console.warn(`[cloud-backup] ${provider.label} token revocation failed: ${error.message}`);
      }
    }
    this.credentialsStore.update(credentials => { delete credentials[id]; });
    this.accessTokens.delete(id);
    console.log(`[cloud-backup] ${provider.label} disconnected`);
    return { revoked };
  }
}
