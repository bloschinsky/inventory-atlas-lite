import { InvalidClientMetadataError, InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidTokenError }
  from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { cleanText } from './mapping.js';

/*
  The adapter's OAuth 2.1 authorization server logic behind the SDK's maintained handlers
  (`mcpAuthRouter`: metadata, /authorize, /token with PKCE S256 verification, /register, /revoke).
  The SDK parses and validates the protocol messages; this class decides what is allowed:

  - exactly one scope exists, `inventory:read`; an unknown scope is refused, none means that one;
  - exactly one resource exists, this server's /mcp URL; a token for anything else is never issued;
  - a client registers itself (RFC 7591) but cannot do anything until the owner approves it on the
    consent page with a one-time code from the host (see consent.js); waiting registrations expire
    and the oldest are evicted, so anonymous registrations cannot lock the owner out (authStore.js);
  - tokens are opaque random values stored as hashes, so there is no signing key to protect or rotate
    and every token can be revoked at once; access tokens are short-lived, refresh tokens rotate and a
    reused one revokes its grant.

  Nothing here ever sees or forwards the Atlas API token: an OAuth token is only ever checked here.
*/
export const SCOPE = 'inventory:read';
export const SCOPES_SUPPORTED = Object.freeze([SCOPE]);

const MAX_REDIRECT_URIS = 5;
// Wrong PKCE verifiers tolerated for one authorization code before it is burned.
export const MAX_CODE_ATTEMPTS = 3;
const MAX_URI_LENGTH = 2000;

const isLoopback = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

// A redirect URI a public client may register: HTTPS anywhere, plain HTTP only on loopback (native apps, RFC 8252).
function checkRedirectUri(value) {
  if (typeof value !== 'string' || value.length > MAX_URI_LENGTH) throw new InvalidClientMetadataError('redirect_uri is too long.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidClientMetadataError('redirect_uri is not a valid URL.');
  }
  if (url.hash) throw new InvalidClientMetadataError('redirect_uri must not contain a fragment.');
  if (url.username || url.password) throw new InvalidClientMetadataError('redirect_uri must not contain credentials.');
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && isLoopback(url.hostname)) return;
  throw new InvalidClientMetadataError('redirect_uri must use https, or http on a loopback address.');
}

const sameResource = (value, expected) => String(value).replace(/#.*$/, '').replace(/\/$/, '') === expected;

export class AtlasOAuthProvider {
  constructor({ store, oauth, consent, logger }) {
    Object.assign(this, { store, oauth, consent, logger });
    this.issue = { accessTtlMs: oauth.accessTokenSeconds * 1000, refreshTtlMs: oauth.refreshTokenSeconds * 1000 };
    this.clientsStore = {
      getClient: clientId => store.getClient(clientId),
      registerClient: client => this.registerClient(client)
    };
  }

  // The scopes of a request: none means inventory:read, anything else must be exactly that.
  static scopes(requested) {
    const scopes = [...new Set((requested ?? []).filter(Boolean))];
    if (!scopes.length) return [SCOPE];
    const unknown = scopes.filter(scope => !SCOPES_SUPPORTED.includes(scope));
    if (unknown.length) throw new InvalidScopeError(`Only the ${SCOPE} scope exists.`);
    return scopes;
  }

  checkResource(resource) {
    if (resource !== undefined && !sameResource(resource.href ?? resource, this.oauth.resourceUrl)) {
      throw new InvalidTargetError('This authorization server only issues tokens for its own MCP endpoint.');
    }
  }

  registerClient(client) {
    const redirectUris = client.redirect_uris ?? [];
    if (!redirectUris.length || redirectUris.length > MAX_REDIRECT_URIS) throw new InvalidClientMetadataError(`Register 1 to ${MAX_REDIRECT_URIS} redirect URIs.`);
    redirectUris.forEach(checkRedirectUri);
    const grants = client.grant_types ?? ['authorization_code', 'refresh_token'];
    if (!grants.includes('authorization_code') || grants.some(grant => !['authorization_code', 'refresh_token'].includes(grant))) {
      throw new InvalidClientMetadataError('Only the authorization_code and refresh_token grants are supported.');
    }
    if ((client.response_types ?? ['code']).some(type => type !== 'code')) throw new InvalidClientMetadataError('Only the code response type is supported.');
    if (client.scope !== undefined) {
      try {
        AtlasOAuthProvider.scopes(client.scope.split(' '));
      } catch {
        throw new InvalidClientMetadataError(`Only the ${SCOPE} scope exists.`);
      }
    }
    // Only what the consent page and the token endpoint use is kept; URLs a client offers (logo, policy,
    // JWKS, metadata) are never fetched, so registration cannot make the server reach anywhere.
    const name = cleanText(client.client_name, 100)?.replace(/\s+/g, ' ') || 'Unnamed MCP client';
    const stored = {
      client_id: client.client_id,
      client_id_issued_at: client.client_id_issued_at,
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: grants,
      response_types: ['code'],
      scope: SCOPE,
      token_endpoint_auth_method: client.token_endpoint_auth_method === 'none' ? 'none' : 'client_secret_post',
      ...(client.client_secret ? { client_secret: client.client_secret, client_secret_expires_at: client.client_secret_expires_at ?? 0 } : {})
    };
    this.store.registerClient(stored);
    this.logger.info('oauth client registered', { client_id: stored.client_id, client_name: name, public_client: !stored.client_secret });
    return stored;
  }

  // Called by the SDK's /authorize after it validated the client and its redirect URI.
  async authorize(client, params, res) {
    const scopes = AtlasOAuthProvider.scopes(params.scopes);
    this.checkResource(params.resource);
    await this.consent.show(client, { ...params, scopes }, res);
  }

  async challengeForAuthorizationCode(client, code) {
    const row = this.store.authorizationCode(code);
    if (!row || row.client_id !== client.client_id || row.used_at !== null || row.expires_at <= this.store.clock()) {
      // A spent code presented again is a replay; redeeming it again revokes the grant made from it.
      if (row && row.used_at !== null && row.client_id === client.client_id) {
        this.store.redeemAuthorizationCode(code, this.issue);
        this.logger.warn('oauth authorization code replayed; its grant is revoked', { client_id: client.client_id });
      }
      throw new InvalidGrantError('The authorization code is invalid, expired, or already used.');
    }
    if (this.store.countCodeAttempt(code) > MAX_CODE_ATTEMPTS) throw new InvalidGrantError('The authorization code is invalid, expired, or already used.');
    return row.code_challenge;
  }

  // The SDK has verified the PKCE code_verifier against the stored challenge before this runs.
  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    const row = this.store.authorizationCode(code);
    if (!row || row.client_id !== client.client_id) throw new InvalidGrantError('The authorization code is invalid.');
    if (redirectUri !== undefined && redirectUri !== row.redirect_uri) throw new InvalidGrantError('redirect_uri does not match the authorization request.');
    this.checkResource(resource);
    const result = this.store.redeemAuthorizationCode(code, this.issue);
    if (!result.tokens) {
      if (result.replayed) this.logger.warn('oauth authorization code replayed; its grant is revoked', { client_id: client.client_id });
      throw new InvalidGrantError('The authorization code is invalid, expired, or already used.');
    }
    this.logger.info('oauth tokens issued', { client_id: client.client_id, grant: result.grant.id });
    return this.tokenResponse(result.tokens, result.grant.scopes);
  }

  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const token = this.store.token(refreshToken, 'refresh');
    if (!token || token.clientId !== client.client_id) throw new InvalidGrantError('The refresh token is invalid.');
    this.checkResource(resource);
    if (scopes?.length && AtlasOAuthProvider.scopes(scopes).some(scope => !token.scopes.includes(scope))) {
      throw new InvalidScopeError('A refresh cannot add scopes.');
    }
    if (!token.active && !token.used) throw new InvalidGrantError('The refresh token is invalid.');
    const result = this.store.rotateRefreshToken(refreshToken, this.issue);
    if (!result.tokens) {
      if (result.reused) this.logger.warn('oauth refresh token reused; its grant is revoked', { client_id: client.client_id, grant: token.grantId });
      throw new InvalidGrantError('The refresh token is invalid.');
    }
    return this.tokenResponse(result.tokens, token.scopes);
  }

  tokenResponse({ accessToken, refreshToken }, scopes) {
    return { access_token: accessToken, token_type: 'Bearer', expires_in: this.oauth.accessTokenSeconds, refresh_token: refreshToken, scope: scopes.join(' ') };
  }

  // Every MCP request: only an active access token of this server, for this resource, is accepted.
  async verifyAccessToken(value) {
    const token = typeof value === 'string' && value.startsWith('amcp_at_') ? this.store.token(value, 'access') : null;
    if (!token?.active || !sameResource(token.resource, this.oauth.resourceUrl)) throw new InvalidTokenError('The access token is invalid, expired, or revoked.');
    return { token: value, clientId: token.clientId, scopes: token.scopes, expiresAt: Math.floor(token.expiresAt / 1000), resource: new URL(token.resource), extra: { grantId: token.grantId } };
  }

  // RFC 7009: revoking either token of a pair ends the grant; unknown tokens and other clients' tokens are ignored.
  async revokeToken(client, { token: value }) {
    const token = this.store.token(value);
    if (token && token.clientId === client.client_id) {
      this.store.revokeGrant(token.grantId, 'revoked_by_client');
      this.logger.info('oauth grant revoked by its client', { client_id: client.client_id, grant: token.grantId });
    }
  }
}
