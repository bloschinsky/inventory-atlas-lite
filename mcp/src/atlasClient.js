import { ToolError, fromAtlasResponse } from './errors.js';

/*
  The only way the adapter reaches Atlas: GET requests to its protected REST API with the dedicated
  bearer token. There is deliberately no method parameter, so no tool can send a write, and the path
  is always built here from validated parts, so no caller can name an arbitrary URL.

  Every request has one deadline (waiting for a slot, connection, and answer together), follows the
  caller's cancellation, is never redirected (the token must not travel to another address), and
  reads at most `maxResponseBytes`. At most `maxConcurrency` requests run at once and `maxQueue` wait;
  beyond that the call is refused as busy rather than queued without bound. Nothing is retried.
*/
export class AtlasClient {
  constructor({ baseUrl, token, timeoutMs, maxResponseBytes, maxConcurrency, maxQueue }, { fetch: fetchImpl = fetch } = {}) {
    Object.assign(this, { baseUrl, timeoutMs, maxResponseBytes, maxConcurrency, maxQueue, fetchImpl });
    // Kept off the enumerable properties so the token never shows up in an inspected or logged object.
    Object.defineProperty(this, 'authorization', { value: `Bearer ${token}`, enumerable: false });
    this.active = 0;
    this.waiting = [];
  }

  /*
    Waits for a request slot. `signal` already carries the request's deadline, so a request that
    waits too long gives up in the queue as well; an aborted waiter removes itself, and a slot is only
    ever handed to a waiter that is still in the queue, so none is lost and `active` never drifts.
  */
  async acquire(signal) {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }
    if (this.waiting.length >= this.maxQueue) throw new ToolError('rate_limited', { detail: 'Too many Atlas requests are already waiting.' });
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiting.indexOf(entry);
        if (index !== -1) this.waiting.splice(index, 1);
        reject(new Error('aborted'));
      };
      const entry = () => { signal.removeEventListener('abort', onAbort); resolve(); };
      signal.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(entry);
    });
  }

  release() {
    const next = this.waiting.shift();
    // The slot passes straight to the next waiting request.
    if (next) next();
    else this.active -= 1;
  }

  // `segments` are path parts below /api, each encoded; `query` values that are undefined are left out.
  url(segments, query = {}) {
    const url = new URL(`${this.baseUrl}/api/${segments.map(segment => encodeURIComponent(String(segment))).join('/')}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return url;
  }

  // The deadline starts here, before the queue: waiting for a slot counts against the same time.
  async get(segments, query, { signal } = {}) {
    if (signal?.aborted) throw new ToolError('cancelled');
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      await this.acquire(combined);
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw this.abortError(signal, deadline) ?? new ToolError('upstream_unavailable');
    }
    try {
      return await this.send(this.url(segments, query), signal, deadline, combined);
    } finally {
      this.release();
    }
  }

  async send(url, signal, deadline, combined) {
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: this.authorization },
        redirect: 'error',
        signal: combined
      });
    } catch {
      throw this.abortError(signal, deadline) ?? new ToolError('upstream_unavailable');
    }
    let text;
    try {
      text = await this.readBody(response, combined);
    } catch (error) {
      if (error instanceof ToolError) throw error;
      throw this.abortError(signal, deadline) ?? new ToolError('upstream_unavailable');
    }
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      if (response.ok) throw new ToolError('upstream_error', { status: response.status, detail: 'Atlas answered with something other than JSON.' });
    }
    if (!response.ok) throw fromAtlasResponse(response.status, body?.error?.code, response.headers.get('retry-after'));
    return body;
  }

  abortError(signal, deadline) {
    if (signal?.aborted) return new ToolError('cancelled');
    if (deadline.aborted) return new ToolError('upstream_unavailable', { detail: 'Atlas did not answer in time.' });
    return null;
  }

  // Reads the body as text but stops as soon as it passes the size cap, without buffering the rest.
  async readBody(response, signal) {
    const declared = Number(response.headers.get('content-length'));
    if (declared > this.maxResponseBytes) {
      await response.body?.cancel().catch(() => {});
      throw new ToolError('response_too_large');
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      if (signal.aborted) {
        await reader.cancel().catch(() => {});
        throw new Error('aborted');
      }
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > this.maxResponseBytes) {
        await reader.cancel().catch(() => {});
        throw new ToolError('response_too_large');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
