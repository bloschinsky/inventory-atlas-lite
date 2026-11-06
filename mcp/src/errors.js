/*
  The adapter's error vocabulary. Every failure a tool can meet becomes one of these kinds with a
  fixed, non-sensitive message: no token, upstream address, stack, or response body ever reaches an
  MCP client. `atlasCode` is Atlas's own stable error code (for example ITEM_NOT_FOUND), safe to show.
*/
export const ERROR_MESSAGES = Object.freeze({
  invalid_input: 'The request is not valid for this tool.',
  not_found: 'Atlas has no such record.',
  auth_rejected: 'Atlas rejected the adapter\'s API token: it is missing, revoked, expired, or its owner was disabled. Ask the administrator for a new inventory:read token.',
  forbidden: 'The adapter\'s API token is not allowed to read this.',
  rate_limited: 'Atlas or the adapter is busy. Try again shortly.',
  upstream_unavailable: 'Atlas is not reachable right now. Try again shortly.',
  upstream_error: 'Atlas could not answer this request.',
  response_too_large: 'Atlas\'s answer is larger than the adapter accepts. Narrow the request.',
  cancelled: 'The request was cancelled.'
});

export class ToolError extends Error {
  constructor(kind, { atlasCode = null, status = null, detail = null, retryAfterSeconds = null } = {}) {
    super(ERROR_MESSAGES[kind] ?? ERROR_MESSAGES.upstream_error);
    this.kind = Object.hasOwn(ERROR_MESSAGES, kind) ? kind : 'upstream_error';
    this.atlasCode = atlasCode;
    this.status = status;
    // A short explanation written by the adapter itself, never text copied from a response.
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  toJSON() {
    return {
      error: {
        kind: this.kind,
        message: this.message,
        ...(this.detail ? { detail: this.detail } : {}),
        ...(this.atlasCode ? { atlas_code: this.atlasCode } : {}),
        ...(this.retryAfterSeconds ? { retry_after_seconds: this.retryAfterSeconds } : {})
      }
    };
  }
}

// Atlas's HTTP status and `{ error: { code } }` body mapped to a kind.
export function fromAtlasResponse(status, code, retryAfter) {
  const atlasCode = typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : null;
  if (status === 401) return new ToolError('auth_rejected', { status, atlasCode });
  if (status === 403 && atlasCode === 'AUTH_HTTPS_REQUIRED') {
    return new ToolError('forbidden', { status, atlasCode, detail: 'Atlas refuses API tokens over plain HTTP from this address; see the MCP adapter documentation.' });
  }
  if (status === 403) return new ToolError('forbidden', { status, atlasCode });
  if (status === 404) return new ToolError('not_found', { status, atlasCode });
  if (status === 400 || status === 422) return new ToolError('invalid_input', { status, atlasCode });
  if (status === 429) {
    const seconds = Number.parseInt(retryAfter);
    return new ToolError('rate_limited', { status, atlasCode, retryAfterSeconds: seconds > 0 && seconds < 3600 ? seconds : null });
  }
  if (status === 502 || status === 503 || status === 504) return new ToolError('upstream_unavailable', { status, atlasCode });
  return new ToolError('upstream_error', { status, atlasCode });
}
