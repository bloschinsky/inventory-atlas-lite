import fs from 'node:fs/promises';
import { httpError } from '../httpError.js';

/*
  A normalized provider failure: `code` and `params` are what the API answers with, `reason` is the
  internal classification callers react to (a refused token is retried once after a refresh).
*/
export const cloudError = (status, code, reason, params = {}) => Object.assign(httpError(status, code, params), { reason });

// Short request timeout for API calls; an upload chunk may take much longer on a slow uplink.
export const API_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 10 * 60_000;
// Google requires chunks in multiples of 256 KiB; Dropbox accepts up to 150 MB per request.
export const DEFAULT_CHUNK_BYTES = 32 * 1024 * 1024;

// Reads a file as consecutive chunks without holding the whole snapshot in memory.
export async function* fileChunks(file, chunkBytes) {
  const handle = await fs.open(file, 'r');
  try {
    let offset = 0;
    for (;;) {
      const buffer = Buffer.alloc(chunkBytes);
      const { bytesRead } = await handle.read(buffer, 0, chunkBytes, offset);
      if (bytesRead === 0) return;
      yield { offset, bytes: buffer.subarray(0, bytesRead) };
      offset += bytesRead;
    }
  } finally {
    await handle.close();
  }
}

/*
  The HTTP transport shared by the cloud storage adapters: timeouts, unreachable providers, and the
  failures every provider reports the same way. Tokens travel only in headers or form bodies and are
  never logged; neither are request bodies, which carry the inventory.
*/
export class CloudStorageHttp {
  constructor({ label }) {
    this.label = label;
  }

  // Resolves with the status, headers, and parsed body of any HTTP answer; throws only when there is none.
  async send(url, { method = 'POST', headers = {}, body, timeoutMs = API_TIMEOUT_MS } = {}) {
    let response;
    try {
      response = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw cloudError(504, 'CLOUD_TIMEOUT', 'timeout', { provider: this.label });
      }
      console.warn('Cloud storage provider unreachable', { provider: this.label, reason: error.cause?.code || error.message });
      throw cloudError(502, 'CLOUD_UNREACHABLE', 'unavailable', { provider: this.label });
    }
    const text = await response.text().catch(() => '');
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* Not JSON: kept as text for the log. */ }
    return { ok: response.ok, status: response.status, headers: response.headers, body: parsed, text };
  }

  sendJson(url, value, { headers = {}, ...options } = {}) {
    return this.send(url, { ...options, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  }

  sendForm(url, fields) {
    return this.send(url, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  }

  // A refused token exchange or refresh. `invalid_grant` means the grant is gone for good.
  failToken(response, task) {
    console.warn('Cloud storage OAuth error', { provider: this.label, status: response.status, task, error: response.body?.error });
    if (response.body?.error === 'invalid_grant') {
      throw cloudError(502, 'CLOUD_ACCESS_REVOKED', 'auth_revoked', { provider: this.label });
    }
    if (response.body?.error === 'invalid_client' || response.body?.error === 'unauthorized_client') {
      throw cloudError(502, 'CLOUD_APP_REJECTED', 'not_configured', { provider: this.label });
    }
    this.fail(response, task);
  }

  // The failures that mean the same for every provider; adapters handle their own details first.
  fail(response, task, reason = 'provider_error') {
    console.warn('Cloud storage provider error', { provider: this.label, status: response.status, task });
    const { status } = response;
    const provider = this.label;
    if (status === 401) throw cloudError(502, 'CLOUD_ACCESS_REJECTED', 'unauthorized', { provider });
    if (status === 429) throw cloudError(503, 'CLOUD_RATE_LIMITED', 'rate_limited', { provider });
    if (status === 408 || status === 504) throw cloudError(504, 'CLOUD_TIMEOUT', 'timeout', { provider });
    if (status >= 500) throw cloudError(502, 'CLOUD_PROVIDER_UNAVAILABLE', 'unavailable', { provider, status });
    throw cloudError(502, 'CLOUD_REQUEST_FAILED', reason, { provider, status });
  }
}
